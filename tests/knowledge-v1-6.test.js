const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = require('../js/core.js');
global.TodoCore = Core;
const Storage = require('../js/storage.js');

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
