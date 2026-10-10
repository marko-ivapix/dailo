const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const Core = require('../js/core.js');

function fixture(type = 'resource') {
  let adapter;
  runInNewContextWithI18n(fs.readFileSync(require.resolve('../js/knowledge.js'), 'utf8'), {
    window: { TodoDomainModules: { register: value => { adapter = value; } } },
    requestAnimationFrame: fn => fn(), URL,
  });
  const resource = { id: 'r', title: 'Book one', description: 'Original description', areaId: 'area', tagIds: ['tag'], attachmentIds: ['file'], linkUrls: ['https://example.com'], relatedTaskIds: ['task'], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [], createdAt: '2026-09-01', updatedAt: '2026-09-01', type: 'book', status: 'unread', author: 'Author', favorite: false, reviewedAt: null, clip: '' };
  const note = { id: 'n', title: 'Note one', body: 'Original body', areaId: 'area', tagIds: ['tag'], attachmentIds: ['note-file'], linkUrls: [], createdAt: '2026-09-01', updatedAt: '2026-09-01' };
  const state = { resources: [resource], notes: [note], areas: [{ id: 'area', name: 'Work', status: 'active' }], tags: [{ id: 'tag', name: 'Reading', color: 'blue' }], tasks: [{ id: 'task', title: 'Read' }], projects: [], goals: [], habits: [], ui: {} };
  const inputs = { '#knowledge-area': { value: 'area' } };
  let saved;
  const ctx = { state, Core, esc: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'), knowledgeCollection: type => type === 'note' ? 'notes' : 'resources',
    getArea: id => state.areas.find(area => area.id === id),
    attachmentOwner: ({ownerType, ownerId}) => { const item = state[ownerType === 'note' ? 'notes' : 'resources'].find(item => item.id === ownerId); return item ? { item, ownerType, ownerId } : null; },
    closePopover() {}, flushTextSave() {}, goalFocusTarget() {}, renderModal() {}, render() {}, saveAndRender() {},
    setModalState: value => { ctx.modalState = value; }, $: selector => inputs[selector],
    $$: selector => selector.includes('knowledge-tag') ? [{ value: 'tag' }] : selector.includes('relatedTaskIds') ? [{ value: 'task' }] : [],
    loadOwnerAttachments() {}, nowIso: () => '2026-09-17T12:00:00Z', uid: () => 'new', copyTemplate: value => JSON.parse(JSON.stringify(value)),
    saveState: () => { saved = JSON.parse(JSON.stringify(state)); return true; }, closeModal: () => { ctx.modalState = null; }, navigate() {}, setToastMessage() {},
    pageHeader: () => '', modalFrame: body => body, renderAttachmentsSection: owner => `<div data-attachment-owner="${owner.ownerType}:${owner.ownerId}"></div>`,
    openPopover() {}, refreshSheet() {}, scheduleTextSave() {}, formatDate: value => value, emptyState: () => '',
  };
  const action = (name, dataset = {}) => adapter.handleAction(name, { target: { closest: () => ({ dataset: { ownerType: type, ownerId: type === 'note' ? 'n' : 'r', ...dataset } }) } }, ctx);
  const open = () => adapter.handleAction('open-knowledge', { ownerType: type, ownerId: type === 'note' ? 'n' : 'r' }, ctx);
  const filter = (field, value) => adapter.handleAction('knowledge-set-filter', { target: { closest: () => ({ dataset: { ownerType: 'resource', field, value } }) } }, ctx);
  return { adapter, ctx, state, resource, note, inputs, action, open, filter, saved: () => saved };
}

// Redesign R10b (S3): the edit form and the item page became the item window, whose sheets save each change at once,
// and the filter selects became chips with choice sheets. These tests keep the V1.5 guarantees on the new surface.

test('Resource metadata editing preserves Area, tags, relations, links and attachment ownership', () => {
  const f = fixture();
  f.open();
  assert.match(f.adapter.renderRoute({ type: 'modal', modalType: 'knowledge' }, f.ctx), /data-action="knowledge-type"/);
  f.action('knowledge-set-type', { value: 'video' });
  f.action('knowledge-set-status', { value: 'reading' });
  f.inputs['#knowledge-author-value'] = { value: 'New Author' };
  f.action('knowledge-author-apply');
  f.inputs['#knowledge-reviewed-value'] = { value: '2026-09-17' };
  f.action('knowledge-reviewed-apply');
  f.action('knowledge-window-favorite');
  f.inputs['#knowledge-clip-value'] = { value: '<quote>Useful excerpt</quote>' };
  f.action('knowledge-clip-apply');
  const item = f.saved().resources[0];
  assert.equal(item.type, 'video'); assert.equal(item.status, 'reading'); assert.equal(item.author, 'New Author');
  assert.equal(item.reviewedAt, '2026-09-17'); assert.equal(item.favorite, true); assert.equal(item.clip, '<quote>Useful excerpt</quote>');
  assert.equal(item.description, 'Original description');
  assert.deepEqual(item.tagIds, ['tag']); assert.equal(item.areaId, 'area');
  assert.deepEqual(item.attachmentIds, ['file']); assert.deepEqual(item.relatedTaskIds, ['task']);
  assert.deepEqual(item.linkUrls, ['https://example.com']); assert.equal(f.saved().notes[0].body, 'Original body');
});

test('Notes save separate clipping and favorites without acquiring Resource metadata', () => {
  const f = fixture('note'); f.open();
  const html = f.adapter.renderRoute({ type: 'modal', modalType: 'knowledge' }, f.ctx);
  assert.match(html, /data-action="knowledge-clip"/); assert.doesNotMatch(html, /data-action="knowledge-type"/);
  assert.match(html, /data-attachment-owner="note:n"/);
  f.inputs['#knowledge-clip-value'] = { value: 'Clipped note text' };
  f.action('knowledge-clip-apply');
  f.action('knowledge-window-favorite');
  assert.equal(f.saved().notes[0].clip, 'Clipped note text'); assert.equal(f.saved().notes[0].favorite, true);
  assert.equal(f.saved().notes[0].type, undefined); assert.deepEqual(f.saved().notes[0].attachmentIds, ['note-file']);
});

test('Local Resource filters intersect type, reading status, favorites, Area and tags', () => {
  const f = fixture();
  f.state.resources.push({ ...f.resource, id: 'r2', title: 'Favorite video', type: 'video', status: 'reading', favorite: true });
  for (const [key, value] of [['type', 'video'], ['status', 'reading'], ['favorite', 'true'], ['areaId', 'area'], ['tagId', 'tag']]) f.filter(key, value);
  const html = f.adapter.renderRoute({ type: 'resources' }, f.ctx);
  assert.match(html, /Favorite video/); assert.doesNotMatch(html, /Book one/);
  assert.equal(f.state.resources.length, 2); assert.equal(f.state.notes.length, 1);
  assert.match(f.adapter.renderRoute({ type: 'notes' }, f.ctx), /Note one/);
});

test('Favorite action persists only its owner and rolls back a failed write', () => {
  const f = fixture(); f.action('toggle-knowledge-favorite');
  assert.equal(f.resource.favorite, true);
  assert.equal(f.saved().resources[0].favorite, true); assert.equal(f.note.favorite, undefined);
  f.ctx.saveState = () => false;
  f.action('toggle-knowledge-favorite');
  assert.equal(f.resource.favorite, true);
});

test('Each local filter excludes a mismatch and clear restores the list', () => {
  for (const [key, value, change] of [
    ['type', 'book', { type: 'video' }], ['status', 'unread', { status: 'reading' }],
    ['favorite', 'true', { favorite: false }], ['areaId', 'area', { areaId: null }],
    ['tagId', 'tag', { tagIds: [] }],
  ]) {
    const f = fixture(); f.resource.favorite = true;
    f.state.resources.push({ ...f.resource, id: 'r2', title: 'Mismatch', ...change });
    f.filter(key, value);
    assert.doesNotMatch(f.adapter.renderRoute({ type: 'resources' }, f.ctx), /Mismatch/);
    f.action('clear-knowledge-filters');
    assert.match(f.adapter.renderRoute({ type: 'resources' }, f.ctx), /Mismatch/);
  }
});

test('Resource rejects invalid review dates and restores metadata on storage failure', () => {
  const f = fixture(); f.open();
  f.inputs['#knowledge-reviewed-value'] = { value: '2026-02-31' };
  f.action('knowledge-reviewed-apply');
  assert.match(f.ctx.modalState.error, /valid/); assert.equal(f.resource.reviewedAt, null);
  f.ctx.saveState = () => false;
  f.inputs['#knowledge-author-value'] = { value: 'Changed' };
  f.action('knowledge-author-apply');
  f.inputs['#knowledge-clip-value'] = { value: 'Changed clip' };
  f.action('knowledge-clip-apply');
  assert.equal(f.resource.author, 'Author'); assert.equal(f.resource.clip, '');
  assert.equal(f.resource.reviewedAt, null); assert.match(f.ctx.modalState.error, /could not be saved/);
});

test('Clipped text is escaped in the window and attachments keep their owner', () => {
  const f = fixture(); f.resource.clip = '<img src=x onerror=alert(1)>';
  f.open();
  const html = f.adapter.renderRoute({ type: 'modal', modalType: 'knowledge' }, f.ctx);
  assert.match(html, /<blockquote class="knowledge-clip-quote">&lt;img/); assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-attachment-owner="resource:r"/);
  assert.match(html, /<span class="task-window-row-label">Related Tasks<\/span><span class="task-window-row-value is-set">Read<\/span>/);
});
