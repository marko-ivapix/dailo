const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

function fixture(type = 'resource') {
  let adapter;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/knowledge.js'), 'utf8'), {
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
  };
  const action = (name, dataset = {}) => adapter.handleAction(name, { target: { closest: () => ({ dataset: { ownerType: type, ownerId: type === 'note' ? 'n' : 'r', ...dataset } }) } }, ctx);
  return { adapter, ctx, state, resource, note, inputs, action, saved: () => saved };
}

test('Resource metadata editing preserves Area, tags, relations, links and attachment ownership', () => {
  const f = fixture();
  f.action('edit-knowledge');
  Object.assign(f.inputs, { '#knowledge-resource-type': { value: 'video' }, '#knowledge-resource-status': { value: 'reading' }, '#knowledge-author': { value: 'New Author' }, '#knowledge-reviewed-at': { value: '2026-09-17' }, '#knowledge-favorite': { checked: true }, '#knowledge-clip': { value: '<quote>Useful excerpt</quote>' } });
  assert.match(f.adapter.renderRoute({ type: 'modal', modalType: 'knowledge' }, f.ctx), /id="knowledge-resource-type"/);
  f.action('save-knowledge');
  const item = f.saved().resources[0];
  assert.equal(item.type, 'video'); assert.equal(item.status, 'reading'); assert.equal(item.author, 'New Author');
  assert.equal(item.reviewedAt, '2026-09-17'); assert.equal(item.favorite, true); assert.equal(item.clip, '<quote>Useful excerpt</quote>');
  assert.equal(item.description, 'Original description');
  assert.deepEqual(item.tagIds, ['tag']); assert.equal(item.areaId, 'area');
  assert.deepEqual(item.attachmentIds, ['file']); assert.deepEqual(item.relatedTaskIds, ['task']);
  assert.deepEqual(item.linkUrls, ['https://example.com']); assert.equal(f.saved().notes[0].body, 'Original body');
});

test('Notes save separate clipping and favorites without acquiring Resource metadata', () => {
  const f = fixture('note'); f.action('edit-knowledge');
  f.inputs['#knowledge-clip'] = { value: 'Clipped note text' };
  f.inputs['#knowledge-favorite'] = { checked: true };
  const html = f.adapter.renderRoute({ type: 'modal', modalType: 'knowledge' }, f.ctx);
  assert.match(html, /id="knowledge-clip"/); assert.doesNotMatch(html, /id="knowledge-resource-type"/);
  assert.match(html, /data-attachment-owner="note:n"/);
  f.action('save-knowledge');
  assert.equal(f.saved().notes[0].clip, 'Clipped note text'); assert.equal(f.saved().notes[0].favorite, true);
  assert.equal(f.saved().notes[0].type, undefined); assert.deepEqual(f.saved().notes[0].attachmentIds, ['note-file']);
});

test('Local Resource filters intersect type, reading status, favorites, Area and tags', () => {
  const f = fixture();
  f.state.resources.push({ ...f.resource, id: 'r2', title: 'Favorite video', type: 'video', status: 'reading', favorite: true });
  for (const [key, value] of [['type', 'video'], ['status', 'reading'], ['favorite', 'true'], ['areaId', 'area'], ['tagId', 'tag']]) {
    f.adapter.handleInput({ type: 'change', target: { dataset: { knowledgeFilter: key, ownerType: 'resource' }, value } }, f.ctx);
  }
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
    f.adapter.handleInput({ type: 'change', target: { dataset: { knowledgeFilter: key, ownerType: 'resource' }, value } }, f.ctx);
    assert.doesNotMatch(f.adapter.renderRoute({ type: 'resources' }, f.ctx), /Mismatch/);
    f.action('clear-knowledge-filters');
    assert.match(f.adapter.renderRoute({ type: 'resources' }, f.ctx), /Mismatch/);
  }
});

test('Resource rejects invalid review dates and restores metadata on storage failure', () => {
  const f = fixture(); f.action('edit-knowledge');
  f.inputs['#knowledge-reviewed-at'] = { value: '2026-02-31' };
  f.action('save-knowledge');
  assert.match(f.ctx.modalState.error, /valid/); assert.equal(f.resource.reviewedAt, null);
  f.inputs['#knowledge-reviewed-at'].value = '2026-09-17';
  f.inputs['#knowledge-author'] = { value: 'Changed' };
  f.inputs['#knowledge-clip'] = { value: 'Changed clip' };
  f.ctx.saveState = () => false;
  f.action('save-knowledge');
  assert.equal(f.resource.author, 'Author'); assert.equal(f.resource.clip, '');
  assert.equal(f.resource.reviewedAt, null); assert.match(f.ctx.modalState.error, /could not be saved/);
});

test('Clipped detail text is escaped and attachment records retain their owner', () => {
  const f = fixture(); f.resource.clip = '<img src=x onerror=alert(1)>';
  f.ctx.knowledgeAttachmentCache = new Map([['resource:r', { item: f.resource, signature: JSON.stringify(f.resource.attachmentIds), records: [{ id: 'file' }], attachmentState: 'ready' }]]);
  f.ctx.renderAttachmentRow = (record, owner) => `<div data-owner="${owner.ownerType}:${owner.ownerId}:${record.id}"></div>`;
  const html = f.adapter.renderRoute({ type: 'resource', id: 'r' }, f.ctx);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-owner="resource:r:file"/);
  assert.match(html, /data-action="open-task" data-task-id="task"/);
});
