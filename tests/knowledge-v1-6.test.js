const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
const Attachments = require('../js/attachments.js');

test('knowledge record needs a title/name and a link, image, or file', () => {
  assert.equal(Core.validateKnowledgeRecord({ type: 'note', title: '', linkUrls: [], attachmentIds: [] }).valid, false);
  assert.equal(Core.validateKnowledgeRecord({ type: 'note', title: 'Scratch', linkUrls: [], attachmentIds: [] }).valid, false);
  assert.equal(Core.validateKnowledgeRecord({ type: 'resource', title: 'Guide', linkUrls: ['example.com'], attachmentIds: [] }).valid, true);
  assert.equal(Core.validateKnowledgeRecord({ type: 'note', title: 'Sketch', linkUrls: [], attachmentIds: ['image-1'] }).valid, true);
});

test('knowledge validation normalizes names, URLs, and attachment identifiers without changing title storage', () => {
  const result = Core.validateKnowledgeRecord({
    type: 'resource', title: '  Reading list  ', linkUrls: [' example.com ', 'https://example.com', 'mailto:team@example.com'], attachmentIds: ['file-1', 'file-1'],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.title, 'Reading list');
  assert.deepEqual(result.normalized.linkUrls, ['https://example.com', 'mailto:team@example.com']);
  assert.deepEqual(result.normalized.attachmentIds, ['file-1']);
});

test('knowledge validation reports malformed links and unsupported record types', () => {
  const malformed = Core.validateKnowledgeRecord({ type: 'note', title: 'Bad', linkUrls: ['javascript:alert(1)'], attachmentIds: [] });
  assert.equal(malformed.valid, false);
  assert.ok(malformed.errors.includes('linkUrls'));

  const unsupported = Core.validateKnowledgeRecord({ type: 'bookmark', title: 'Bad', linkUrls: ['example.com'], attachmentIds: [] });
  assert.equal(unsupported.valid, false);
  assert.ok(unsupported.errors.includes('type'));
});

test('knowledge attachment snapshots use the existing owner pipeline for notes and resources', () => {
  const note = { id: 'n1', type: 'note', title: 'Sketch', attachmentIds: ['image-1'] };
  const resource = { id: 'r1', type: 'resource', title: 'Guide', attachmentIds: ['file-1'] };

  assert.deepEqual(Storage.attachmentOwners(Storage.knowledgeAttachmentSnapshot(note)).map(owner => [owner.type, owner.item.id]), [['note', 'n1']]);
  assert.deepEqual(Storage.attachmentOwners(Storage.knowledgeAttachmentSnapshot(resource)).map(owner => [owner.type, owner.item.id]), [['resource', 'r1']]);
});

test('Notes editor requires a Name plus a normalized link or an attachment', () => {
  let adapter;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/knowledge.js'), 'utf8'), {
    window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn(), URL,
  });
  const state = { notes: [], resources: [], areas: [], tags: [], tasks: [], projects: [], goals: [], habits: [], ui: {} };
  const inputs = {
    '#knowledge-title': { value: '  Scratch  ', focus() {} }, '#knowledge-text': { value: '' }, '#knowledge-clip': { value: '' }, '#knowledge-favorite': { checked: false }, '#knowledge-area': { value: '' }, '#knowledge-link': { value: '', focus() {} },
  };
  const context = {
    Core, state, knowledgeCollection: type => type === 'note' ? 'notes' : 'resources', attachmentOwner: () => null,
    closePopover() {}, flushTextSave() {}, goalFocusTarget() {}, renderModal() {}, loadOwnerAttachments() {}, setModalState(value) { context.modalState = value; },
    $: selector => inputs[selector], $$: () => [], getArea: () => null, nowIso: () => '2026-09-17T12:00:00Z', uid: () => 'n1', copyTemplate: value => structuredClone(value),
    saveState: () => true, closeModal() {}, navigate() {}, setToastMessage() {}, esc: value => String(value ?? ''), modalFrame: body => body, renderAttachmentsSection: () => '',
  };
  const action = name => adapter.handleAction(name, { target: { closest: () => ({ dataset: { ownerType: 'note' } }) } }, context);

  action('new-knowledge');
  action('save-knowledge');
  assert.match(context.modalState.error, /URL, image, or attached file/);
  inputs['#knowledge-link'].value = 'example.com';
  action('save-knowledge');
  assert.deepEqual(state.notes.map(note => ({ title: note.title, linkUrls: note.linkUrls })), [{ title: 'Scratch', linkUrls: ['https://example.com'] }]);
});

test('new attachment-only Notes and Resources roll back when every upload fails', async () => {
  for (const type of ['note', 'resource']) {
    let adapter;
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/knowledge.js'), 'utf8'), {
      window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn(), URL,
    });
    const state = { notes: [], resources: [], areas: [], tags: [], tasks: [], projects: [], goals: [], habits: [], ui: {} };
    let saveCalls = 0;
    const inputs = {
      '#knowledge-title': { value: 'Upload only' }, '#knowledge-text': { value: '' }, '#knowledge-clip': { value: '' }, '#knowledge-favorite': { checked: false }, '#knowledge-area': { value: '' }, '#knowledge-link': { value: '' },
      '#knowledge-resource-type': { value: 'article' }, '#knowledge-resource-status': { value: 'unread' }, '#knowledge-author': { value: '' }, '#knowledge-reviewed-at': { value: '' },
    };
    const originalPut = Attachments.put;
    Attachments.put = async () => { throw new Error('Injected attachment storage failure'); };
    const context = {
      Core, state, undoHold: null, knowledgeCollection: value => value === 'note' ? 'notes' : 'resources',
      modalState: { type: 'knowledge', ownerType: type, ownerId: null, source: null, busy: false, pendingFiles: [{ name: 'only-source.png' }], draft: { title: 'Upload only', text: '', areaId: null, linkUrls: [], linkDraft: '', tagIds: [], favorite: false, clip: '', resourceType: 'article', resourceStatus: 'unread', author: '', reviewedAt: '', relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [] } },
      attachmentOwner: ({ ownerType, ownerId }) => { const item = state[ownerType === 'note' ? 'notes' : 'resources'].find(entry => entry.id === ownerId); return item ? { type: ownerType, item } : null; },
      renderModal() {}, getArea: () => null, nowIso: () => '2026-09-17T12:00:00Z', uid: () => `${type}-1`, copyTemplate: value => structuredClone(value),
      $: selector => inputs[selector], $$: () => [], saveState: () => { saveCalls++; return true; }, addAttachments: async descriptor => {
        assert.equal(descriptor.deferSave, true);
        const owner = context.attachmentOwner(descriptor);
        const result = await Attachments.putOwned({ id: `${type}-file`, ownerType: type, ownerId: owner.item.id, fileName: 'only-source.png', mimeType: 'image/png', size: 1, blob: new Blob(['x']), pendingDeleteUntil: null }, () => { if (!owner) throw new Error('Owner unavailable'); });
        if (result.added) owner.item.attachmentIds.push(`${type}-file`);
        return { added: result.added ? 1 : 0, message: result.added ? '1 file added.' : 'Attachments are unavailable in this browser.' };
      },
      closeModal() { context.closed = true; }, navigate() { context.navigated = true; }, setToastMessage() {},
    };
    adapter.handleAction('save-knowledge', { target: { closest: () => ({ dataset: { ownerType: type } }) } }, context);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(state[type === 'note' ? 'notes' : 'resources'].length, 0, type);
    assert.equal(saveCalls, 0, type);
    assert.equal(context.closed, undefined, type);
    assert.match(context.modalState.error, /could not be stored/i, type);
    assert.equal(await Attachments.get(`${type}-file`), null, type);
    Attachments.put = originalPut;
  }
});

test('attachment storage cleans a record written before ownership validation fails', async () => {
  const record = { id: 'partial-file', ownerType: 'note', ownerId: 'n1', fileName: 'partial.png', mimeType: 'image/png', size: 1, blob: new Blob(['x']), pendingDeleteUntil: null };
  const result = await Attachments.putOwned(record, () => { throw new Error('Owner changed'); });

  assert.equal(result.added, false);
  assert.equal(await Attachments.get(record.id), null);
});

test('a successful stored upload remains a valid attachment-only Resource source', async () => {
  const record = { id: 'resource-source-file', ownerType: 'resource', ownerId: 'r1', fileName: 'guide.pdf', mimeType: 'application/pdf', size: 1, blob: new Blob(['x']), pendingDeleteUntil: null };
  const result = await Attachments.putOwned(record, () => {});
  const resource = { type: 'resource', title: 'Guide', linkUrls: [], attachmentIds: result.added ? [record.id] : [] };

  assert.equal(result.added, true);
  assert.equal(Core.validateKnowledgeRecord(resource).valid, true);
  assert.equal((await Attachments.get(record.id)).ownerId, 'r1');
  await Attachments.deleteMany([record.id]);
});
