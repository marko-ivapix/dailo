// Redesign R10b: Beleške and Resursi (S3).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10b-notes-resources.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const knowledgeUi = read('js/knowledge.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(knowledgeUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn(), URL });
  return adapter;
}

function fixture(extra = {}) {
  const calls = [];
  const inputs = {};
  const state = {
    notes: [
      { id: 'n1', title: 'Meeting', body: 'Agenda', areaId: 'a1', tagIds: ['t1'], linkUrls: ['https://a.example', 'https://b.example'], attachmentIds: ['f1'], favorite: false, clip: '', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'n2', title: 'Ideas', body: 'Only text', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], favorite: true, clip: '', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' },
    ],
    resources: [{ id: 'r', title: 'Book one', description: 'Original description', areaId: 'a1', tagIds: ['t1'], linkUrls: ['https://example.com'], attachmentIds: [], relatedTaskIds: ['task'], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [], type: 'book', status: 'unread', author: 'Author', reviewedAt: null, favorite: false, clip: '', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
    areas: [{ id: 'a1', name: 'Work', status: 'active' }, { id: 'a2', name: 'Old', status: 'archived' }],
    tags: [{ id: 't1', name: 'Reading', color: '#4f8cff' }, { id: 't2', name: 'Later', color: '#2fbf71' }],
    tasks: [{ id: 'task', title: 'Read' }], projects: [{ id: 'p', name: 'Site' }], goals: [{ id: 'g1', title: 'Learn' }], habits: [{ id: 'h', name: 'Study' }],
    ui: {},
    ...extra.state,
  };
  const collection = type => (type === 'note' ? 'notes' : 'resources');
  let saved = null;
  const ctx = {
    calls, inputs, state, Core, esc,
    knowledgeCollection: collection,
    getArea: id => state.areas.find(area => area.id === id),
    attachmentOwner: ({ ownerType, ownerId }) => { const item = state[collection(ownerType)].find(entry => entry.id === ownerId); return item ? { type: ownerType, item } : null; },
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}"></header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    renderAttachmentsSection: owner => `<div data-attachment-owner="${owner.ownerType}:${owner.ownerId}"></div>`,
    formatDate: value => `D:${value}`,
    $: selector => (selector in inputs ? { value: inputs[selector], focus() {} } : null),
    $$: () => [],
    modalState: null,
    setModalState: value => { ctx.modalState = value; },
    closePopover: () => calls.push(['closePopover']), flushTextSave() {}, goalFocusTarget() {}, loadOwnerAttachments() {},
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    refreshSheet: html => calls.push(['refresh', html]),
    renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']), saveAndRender: () => calls.push(['saveAndRender']),
    scheduleTextSave: () => calls.push(['scheduleTextSave']),
    saveState: () => { saved = JSON.parse(JSON.stringify(state)); calls.push(['save']); return true; },
    closeModal: () => { ctx.modalState = null; }, navigate: route => calls.push(['navigate', route]),
    setToastMessage: message => calls.push(['toast', message]),
    requestDeleteEntity: (type, id) => calls.push(['delete', type, id]),
    nowIso: () => '2026-10-10T08:00:00.000Z', uid: kind => `${kind}-new`, copyTemplate: value => JSON.parse(JSON.stringify(value)),
    undoHold: null,
    ...extra.ctx,
  };
  return { ctx, state, inputs, calls, saved: () => saved };
}
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastSheet = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];
const windowHtml = (module, ctx) => module.renderRoute({ type: 'modal', modalType: 'knowledge' }, ctx);
const rowsOf = html => [...html.matchAll(/<button class="task-window-row" type="button" data-action="([a-z-]+)"(?: data-field="\w+")?><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)<\/span>/g)].map(match => match.slice(1));
const openItem = (module, ctx, ownerType, ownerId) => module.handleAction('open-knowledge', { ownerType, ownerId }, ctx);

test('S3: one list per screen, newest first, with the star, tag dots and the meta line', () => {
  const { ctx } = fixture();
  const module = moduleFor();
  const notes = module.renderRoute({ type: 'notes' }, ctx);
  assert.match(notes, /^<header title="Notes" subtitle="2 notes" add="false"><\/header><div class="sheet-chips knowledge-chips"><button class="quick-chip" type="button" data-action="knowledge-favorite-filter" data-owner-type="note" aria-pressed="false"><i class="ph ph-star" aria-hidden="true"><\/i> Favorites<\/button><button class="quick-chip" type="button" data-action="knowledge-filter" data-owner-type="note" data-field="areaId">Area <i class="ph ph-caret-down" aria-hidden="true"><\/i><\/button><button class="quick-chip" type="button" data-action="knowledge-filter" data-owner-type="note" data-field="tagId">Tag <i class="ph ph-caret-down" aria-hidden="true"><\/i><\/button><\/div><div class="today-card knowledge-list">/);
  assert.deepEqual([...notes.matchAll(/data-route="note\/(\w+)"/g)].map(match => match[1]), ['n2', 'n1']);
  assert.match(notes, /<div class="today-row knowledge-row"><i class="ph ph-note knowledge-row-icon" aria-hidden="true"><\/i><button class="today-row-main" type="button" data-route="note\/n1"><span class="task-title">Meeting<\/span><span class="task-meta">Work · 2 links · 1 file<span class="knowledge-tag-dot" style="--tag-color:#4f8cff" title="Reading"><\/span><\/span><\/button><button class="btn-icon knowledge-favorite " type="button" data-action="toggle-knowledge-favorite" data-owner-type="note" data-owner-id="n1"/);
  assert.match(notes, /data-route="note\/n2"><span class="task-title">Ideas<\/span><span class="task-meta">No area<\/span><\/button><button class="btn-icon knowledge-favorite is-favorite"/);
  const resources = module.renderRoute({ type: 'resources' }, ctx);
  assert.deepEqual([...resources.matchAll(/data-action="knowledge-filter" data-owner-type="resource" data-field="(\w+)">(\w[\w ]*) </g)].map(match => match.slice(1)), [['type', 'Type'], ['status', 'Status'], ['areaId', 'Area'], ['tagId', 'Tag']]);
  assert.match(resources, /<i class="ph ph-link knowledge-row-icon" aria-hidden="true"><\/i><button class="today-row-main" type="button" data-route="resource\/r"><span class="task-title">Book one<\/span><span class="task-meta">Book · Unread · Work/);
  assert.doesNotMatch(notes + resources, /<select|data-knowledge-filter|data-action="new-knowledge"/);
});

test('S3: the chips filter through sheets; "Obriši filtere" clears; the empty states', () => {
  const { ctx, state } = fixture();
  const module = moduleFor();
  act(module, ctx, 'knowledge-favorite-filter', { ownerType: 'note' });
  assert.equal(state.ui.knowledgeFilters.note.favorite, 'true');
  let html = module.renderRoute({ type: 'notes' }, ctx);
  assert.match(html, /subtitle="1 of 2 notes"/);
  assert.match(html, /<button class="quick-chip is-selected" type="button" data-action="knowledge-favorite-filter" data-owner-type="note" aria-pressed="true"><i class="ph-fill ph-star" aria-hidden="true"><\/i> Favorites<\/button>/);
  assert.match(html, /<button class="quick-chip knowledge-clear" type="button" data-action="clear-knowledge-filters" data-owner-type="note">Clear filters<\/button><\/div>/);
  act(module, ctx, 'knowledge-filter', { ownerType: 'note', field: 'areaId' });
  const sheet = lastSheet(ctx);
  assert.match(sheet, /^<div class="popover-title">Area<\/div><div class="sheet-card" role="radiogroup" aria-label="Area">/);
  assert.deepEqual([...sheet.matchAll(/data-pop-action="knowledge-set-filter" data-owner-type="note" data-field="areaId" data-value="([\w-]*)"><span class="sheet-option-label">([^<]+)</g)].map(match => match.slice(1)), [['', 'All areas'], ['__none', 'No area'], ['a1', 'Work'], ['a2', 'Old']]);
  act(module, ctx, 'knowledge-set-filter', { ownerType: 'note', field: 'areaId', value: '__none' });
  assert.equal(state.ui.knowledgeFilters.note.areaId, '__none');
  html = module.renderRoute({ type: 'notes' }, ctx);
  assert.match(html, /data-field="areaId">No area <i class="ph ph-caret-down"/);
  assert.match(html, /data-field="areaId">No area/);
  act(module, ctx, 'knowledge-set-filter', { ownerType: 'note', field: 'tagId', value: 't1' });
  assert.match(module.renderRoute({ type: 'notes' }, ctx), /<p class="today-empty knowledge-empty">No items match these filters\.<\/p>/);
  act(module, ctx, 'knowledge-set-filter', { ownerType: 'note', field: 'status', value: 'reading' });
  assert.equal(state.ui.knowledgeFilters.note.status, undefined, 'notes have no status filter');
  act(module, ctx, 'clear-knowledge-filters', { ownerType: 'note' });
  assert.match(module.renderRoute({ type: 'notes' }, ctx), /subtitle="2 notes"/);
  const empty = fixture({ state: { notes: [] } });
  assert.match(module.renderRoute({ type: 'notes' }, empty.ctx), /<empty No notes yet \| “\+” at the bottom right adds a new one\.>$/);
});

test('S3: a resource opens in a window like the task window', () => {
  const { ctx } = fixture();
  const module = moduleFor();
  openItem(module, ctx, 'resource', 'r');
  const html = windowHtml(module, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet knowledge-window"><div class="modal-header task-window-header"><span class="task-window-kind">Resource<\/span><div class="task-window-actions"><button class="btn-icon knowledge-favorite" type="button" data-action="knowledge-window-favorite" aria-pressed="false" aria-label="Add to favorites"><i class="ph ph-star"><\/i><\/button><button class="btn-icon" type="button" data-action="knowledge-menu" aria-label="Resource actions"><i class="ph ph-dots-three"><\/i><\/button><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><\/div><input id="knowledge-title" class="quick-title-input" type="text" maxlength="120" autocomplete="off" placeholder="Resource name" value="Book one" aria-label="Name"><button class="goal-details-area" type="button" data-action="knowledge-area"><i class="ph ph-squares-four" aria-hidden="true"><\/i>Work<\/button>/);
  assert.deepEqual(rowsOf(html), [
    ['knowledge-type', 'Type', 'Book'], ['knowledge-status', 'Reading status', 'Unread'], ['knowledge-author', 'Author', 'Author'], ['knowledge-reviewed', 'Last reviewed', 'Not reviewed yet'],
    ['knowledge-tags', 'Tags', 'Reading'], ['knowledge-relations', 'Related Tasks', 'Read'], ['knowledge-relations', 'Related Projects', 'None'], ['knowledge-relations', 'Related Goals', 'None'], ['knowledge-relations', 'Related Habits', 'None'], ['knowledge-clip', 'Clipped text', 'None'],
  ]);
  assert.match(html, /<h3 class="goal-details-label">Description<\/h3><textarea id="knowledge-text" class="input knowledge-text" rows="5" placeholder="Description">Original description<\/textarea>/);
  assert.match(html, /<h3 class="goal-details-label">Links · 1<\/h3><div class="habit-window-card knowledge-links"><div class="knowledge-link-row"><a class="knowledge-link" href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">https:\/\/example\.com<\/a><button class="btn-icon" type="button" data-action="remove-knowledge-link" data-link-index="0" aria-label="Remove link"><i class="ph ph-x"><\/i><\/button><\/div><div class="knowledge-link-add"><input id="knowledge-link" class="input" type="url" inputmode="url" autocomplete="off" placeholder="https:\/\/…" value="" aria-label="New link"><button class="btn btn-secondary" type="button" data-action="add-knowledge-link">Add<\/button><\/div><\/div>/);
  assert.match(html, /<h3 class="goal-details-label">Organization<\/h3><div class="habit-window-card">/);
  assert.match(html, /<div data-attachment-owner="resource:r"><\/div><\/div><\/frame>$/, 'no footer for a saved item');
  assert.doesNotMatch(html, /<select|data-action="save-knowledge"|form-hint/);
  // A note has Tekst, no resource rows and no relations; its clip shows as a quote
  const note = fixture();
  note.state.notes[0].clip = '<b>excerpt</b>';
  openItem(module, note.ctx, 'note', 'n1');
  const noteHtml = windowHtml(module, note.ctx);
  assert.deepEqual(rowsOf(noteHtml), [['knowledge-tags', 'Tags', 'Reading'], ['knowledge-clip', 'Clipped text', 'Added']]);
  assert.match(noteHtml, /<span class="task-window-kind">Note<\/span>[\s\S]*placeholder="Note name"[\s\S]*<h3 class="goal-details-label">Text<\/h3><textarea id="knowledge-text" class="input knowledge-text" rows="5" placeholder="Note text">Agenda<\/textarea><h3 class="goal-details-label">Clipped text<\/h3><blockquote class="knowledge-clip-quote">&lt;b>excerpt&lt;\/b><\/blockquote>/);
});

test('S3: an existing item saves at once from its sheets, links, star and fields', () => {
  const { ctx, state, inputs, calls, saved } = fixture();
  const module = moduleFor();
  const item = state.resources[0];
  openItem(module, ctx, 'resource', 'r');
  act(module, ctx, 'knowledge-type');
  assert.deepEqual([...lastSheet(ctx).matchAll(/data-pop-action="knowledge-set-type" data-value="(\w+)"/g)].map(match => match[1]), ['book', 'video', 'article', 'course', 'document', 'other']);
  act(module, ctx, 'knowledge-set-type', { value: 'video' });
  assert.equal(item.type, 'video');
  assert.equal(saved().resources[0].type, 'video');
  assert.deepEqual(calls.slice(-4), [['save'], ['render'], ['renderModal'], ['closePopover']]);
  act(module, ctx, 'knowledge-status');
  act(module, ctx, 'knowledge-set-status', { value: 'reading' });
  assert.equal(item.status, 'reading');
  act(module, ctx, 'knowledge-author');
  assert.match(lastSheet(ctx), /<input id="knowledge-author-value" class="input" maxlength="200" value="Author"/);
  inputs['#knowledge-author-value'] = ' New Author ';
  act(module, ctx, 'knowledge-author-apply');
  assert.equal(item.author, 'New Author');
  act(module, ctx, 'knowledge-reviewed');
  inputs['#knowledge-reviewed-value'] = '2026-02-31';
  act(module, ctx, 'knowledge-reviewed-apply');
  assert.equal(item.reviewedAt, null);
  assert.equal(ctx.modalState.error, 'Choose a valid type, reading status and review date.');
  inputs['#knowledge-reviewed-value'] = '2026-09-17';
  act(module, ctx, 'knowledge-reviewed-apply');
  assert.equal(item.reviewedAt, '2026-09-17');
  assert.equal(ctx.modalState.error, '');
  act(module, ctx, 'knowledge-tags');
  act(module, ctx, 'knowledge-tag-toggle', { tagId: 't2' });
  assert.match(lastSheet(ctx), /data-pop-action="knowledge-tag-toggle" data-tag-id="t2" aria-pressed="true"/);
  act(module, ctx, 'knowledge-tags-apply');
  assert.deepEqual([...item.tagIds], ['t1', 't2']);
  act(module, ctx, 'knowledge-relations', { field: 'relatedGoalIds' });
  assert.match(lastSheet(ctx), /^<div class="popover-title">Related Goals<\/div>/);
  act(module, ctx, 'knowledge-relation-toggle', { id: 'g1' });
  act(module, ctx, 'knowledge-relations-apply');
  assert.deepEqual([...item.relatedGoalIds], ['g1']);
  act(module, ctx, 'knowledge-area');
  assert.doesNotMatch(lastSheet(ctx), /Old/, 'archived areas are not offered');
  act(module, ctx, 'knowledge-set-area', { areaId: '' });
  assert.equal(item.areaId, null);
  act(module, ctx, 'knowledge-clip');
  inputs['#knowledge-clip-value'] = 'An excerpt';
  act(module, ctx, 'knowledge-clip-apply');
  assert.equal(item.clip, 'An excerpt');
  act(module, ctx, 'knowledge-window-favorite');
  assert.equal(item.favorite, true);
  inputs['#knowledge-link'] = 'example.org';
  act(module, ctx, 'add-knowledge-link');
  assert.deepEqual([...item.linkUrls], ['https://example.com', 'https://example.org']);
  inputs['#knowledge-link'] = 'example.org';
  act(module, ctx, 'add-knowledge-link');
  assert.equal(ctx.modalState.error, 'This link has already been added.');
  inputs['#knowledge-link'] = 'javascript:alert(1)';
  act(module, ctx, 'add-knowledge-link');
  assert.equal(ctx.modalState.error, 'Use a valid web or email link.');
  act(module, ctx, 'remove-knowledge-link', { linkIndex: '1' });
  assert.deepEqual([...item.linkUrls], ['https://example.com']);
  // The name and the text save after a short pause; an empty name is refused
  module.handleInput({ type: 'input', target: { id: 'knowledge-title', value: ' Book two ' } }, ctx);
  module.handleInput({ type: 'input', target: { id: 'knowledge-text', value: 'New text' } }, ctx);
  assert.deepEqual([item.title, item.description], ['Book two', 'New text']);
  assert.deepEqual(calls.slice(-1), [['scheduleTextSave']]);
  module.handleInput({ type: 'input', target: { id: 'knowledge-title', value: '  ' } }, ctx);
  module.handleInput({ type: 'change', target: { id: 'knowledge-title', value: '  ' } }, ctx);
  assert.equal(item.title, 'Book two');
  assert.equal(ctx.modalState.error, 'Resource needs a Name.');
  // ⋯ deletes with confirmation
  act(module, ctx, 'knowledge-menu');
  assert.match(lastSheet(ctx), /data-pop-action="delete-knowledge" data-owner-type="resource" data-owner-id="r"><i class="ph ph-trash"><\/i>Delete resource<\/button>/);
  act(module, ctx, 'delete-knowledge', { ownerType: 'resource', ownerId: 'r' });
  assert.deepEqual(calls.at(-1), ['delete', 'resource', 'r']);
});

test('S3: a change that would break the item is refused and the item stays as it was', () => {
  const { ctx, state } = fixture();
  const module = moduleFor();
  const item = state.resources[0];
  openItem(module, ctx, 'resource', 'r');
  act(module, ctx, 'remove-knowledge-link', { linkIndex: '0' });
  assert.deepEqual([...item.linkUrls], ['https://example.com']);
  assert.equal(ctx.modalState.error, 'Resource needs at least one URL, image, or attached file.');
  assert.match(windowHtml(module, ctx), /<a class="knowledge-link" href="https:\/\/example\.com"[\s\S]*<p class="validation" role="alert">Resource needs at least one URL, image, or attached file\.<\/p>/);
  ctx.saveState = () => false;
  act(module, ctx, 'knowledge-status');
  act(module, ctx, 'knowledge-set-status', { value: 'completed' });
  assert.equal(item.status, 'unread');
  assert.equal(ctx.modalState.error, 'Changes could not be saved locally. Try again.');
  // A note may lose its last link: it needs only a name
  const note = fixture();
  openItem(module, note.ctx, 'note', 'n1');
  act(module, note.ctx, 'remove-knowledge-link', { linkIndex: '0' });
  act(module, note.ctx, 'remove-knowledge-link', { linkIndex: '0' });
  assert.deepEqual([...note.state.notes[0].linkUrls], []);
});

test('S3: a text-only note is allowed; "Napravi belešku" keeps the window open on the new note', () => {
  assert.equal(Core.validateKnowledgeRecord({ type: 'note', title: 'Scratch', linkUrls: [], attachmentIds: [] }).valid, true);
  assert.equal(Core.validateKnowledgeRecord({ type: 'resource', title: 'Guide', linkUrls: [], attachmentIds: [] }).valid, false);
  const { ctx, state, inputs, calls } = fixture({ state: { notes: [] } });
  const module = moduleFor();
  act(module, ctx, 'new-knowledge', { ownerType: 'note', areaId: 'a1' });
  let html = windowHtml(module, ctx);
  assert.match(html, /<span class="task-window-kind">Note<\/span><div class="task-window-actions"><button class="btn-icon knowledge-favorite" type="button" data-action="knowledge-window-favorite"[^>]*><i class="ph ph-star"><\/i><\/button><button class="btn-icon" type="button" data-action="close-modal"/, 'no ⋯ before saving');
  assert.match(html, /data-action="knowledge-area"><i class="ph ph-squares-four" aria-hidden="true"><\/i>Work<\/button>/);
  assert.match(html, /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-knowledge">Create note<\/button><\/div><\/div><\/frame>$/);
  inputs['#knowledge-title'] = '  ';
  act(module, ctx, 'save-knowledge');
  assert.equal(ctx.modalState.error, 'Note needs a Name.');
  act(module, ctx, 'knowledge-tags');
  act(module, ctx, 'knowledge-tag-toggle', { tagId: 't1' });
  act(module, ctx, 'knowledge-tags-apply');
  assert.deepEqual([...ctx.modalState.draft.tagIds], ['t1'], 'a draft keeps the sheet choice');
  assert.equal(state.notes.length, 0, 'nothing is saved before "Napravi belešku"');
  Object.assign(inputs, { '#knowledge-title': ' Scratch ', '#knowledge-text': 'Just text' });
  act(module, ctx, 'save-knowledge');
  assert.equal(state.notes.length, 1);
  const [note] = state.notes;
  assert.deepEqual([note.title, note.body, note.areaId, [...note.tagIds], [...note.linkUrls]], ['Scratch', 'Just text', 'a1', ['t1'], []]);
  assert.equal(ctx.modalState.type, 'knowledge');
  assert.equal(ctx.modalState.ownerId, note.id);
  assert.ok(calls.some(call => call[0] === 'toast' && call[1] === 'Note created'));
  assert.ok(!calls.some(call => call[0] === 'navigate'));
  html = windowHtml(module, ctx);
  assert.match(html, /data-action="knowledge-menu" aria-label="Note actions"/);
  assert.doesNotMatch(html, /data-action="save-knowledge"/);
  // A new resource still needs a source
  const resource = fixture();
  act(module, resource.ctx, 'new-knowledge', { ownerType: 'resource' });
  resource.inputs['#knowledge-title'] = 'Guide';
  act(module, resource.ctx, 'save-knowledge');
  assert.equal(resource.ctx.modalState.error, 'Resource needs at least one URL, image, or attached file.');
  assert.equal(resource.state.resources.length, 1);
});

test('app.js: links and old addresses open the window; the floating "+" adds a note or a resource on their screens', () => {
  assert.match(fn('navigate'), /const knowledgeRoute = \/\^#\?\(note\|resource\)\\\/\(\.\+\)\$\/\.exec\(route\);\n\s+if \(knowledgeRoute\) \{ openKnowledgeWindow\(knowledgeRoute\[1\], decodeURIComponent\(knowledgeRoute\[2\]\)\); return; \}/);
  assert.match(fn('renderMain'), /if \(\['note', 'resource'\]\.includes\(route\.type\)\) \{ history\.replaceState\(null, '', route\.type === 'note' \? '#notes' : '#resources'\); openKnowledgeWindow\(route\.type, route\.id\); \}/);
  assert.match(fn('openKnowledgeWindow'), /callDomainHook\('handleAction', 'open-knowledge', \{ ownerType: type, ownerId: id \}\);/);
  assert.match(app, /const QUICK_ADD_DIRECT = Object\.freeze\(\{ '#goals': \[msg\('New goal'\), \(\) => openGoalModal\(\)\], '#notes': \[msg\('New note'\), \(\) => openKnowledgeWindow\('note'\)\], '#resources': \[msg\('New resource'\), \(\) => openKnowledgeWindow\('resource'\)\] \}\);/);
  assert.match(fn('handleClick'), /if \(action === 'toggle-mobile-quick-add'\) \{ const direct = quickAddDirect\(\); if \(direct\) \{ direct\[1\]\(\); return; \}/);
  assert.match(app, /scheduleTextSave, /);
  assert.doesNotMatch(knowledgeUi, /function renderKnowledgeDetail\(|knowledge-detail-metadata|data-knowledge-filter|knowledge-metadata-grid/);
  assert.match(moduleFor().renderRoute({ type: 'note', id: 'n1' }, fixture().ctx), /^<header title="Notes"/, 'the route shows the list');
});

test('the R10b layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10b'));
  assert.ok(layer.length > 20, 'R10b layer');
  for (const selector of ['.knowledge-row', '.knowledge-tag-dot', '.knowledge-window .quick-title-input', '.knowledge-text', '.knowledge-clip-quote', '.knowledge-link-row', '.knowledge-link-add']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Text', 'Tekst'], ['Note text', 'Tekst beleške'], ['New link', 'Novi link'], ['Note created', 'Beleška je napravljena'], ['Resource created', 'Resurs je napravljen'], ['Note name', 'Naziv beleške'], ['Resource name', 'Naziv resursa'], ['No notes yet', 'Još nema beleški'], ['No resources yet', 'Još nema resursa'], ['“+” at the bottom right adds a new one.', '„+“ dole desno dodaje novu.'], ['Added', 'Dodato']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R10b is released as 2.0.0-alpha.20', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.20');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.20';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.20');
});
