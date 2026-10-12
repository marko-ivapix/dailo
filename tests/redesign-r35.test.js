// Redesign R35: the third design pass, additions A, B, H and I (Biblioteka).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r35-library.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n, withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const knowledgeUi = read('js/knowledge.js');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(knowledgeUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn(), URL });
  return adapter;
}

function fixture() {
  const calls = [];
  const elements = {};
  const state = {
    notes: [
      { id: 'n1', title: 'Packing list', body: 'For the trip\n- tent\n* sleeping bag\n• stove\n[x] map\n1. tickets', areaId: 'a1', tagIds: ['t1'], linkUrls: [], attachmentIds: [], favorite: true, clip: '', updatedAt: '2026-10-10T10:00:00.000Z' },
      { id: 'n2', title: 'Ideas', body: 'Čaj i kafa', areaId: null, tagIds: [], linkUrls: ['https://www.example.com/a'], attachmentIds: [], favorite: false, clip: '', updatedAt: '2026-10-09T10:00:00.000Z' },
    ],
    resources: [{ id: 'r1', title: 'Guide', description: 'How to plan', type: 'article', status: 'unread', areaId: null, tagIds: [], linkUrls: ['https://www.example.org/guide'], attachmentIds: [], favorite: false, author: '', updatedAt: '2026-10-10T10:00:00.000Z' }],
    areas: [{ id: 'a1', name: 'Travel', status: 'active' }, { id: 'a2', name: 'Unused', status: 'active' }],
    tags: [{ id: 't1', name: 'Trip', color: '#4f8cff' }, { id: 't2', name: 'Unused tag', color: '#2fbf71' }],
    ui: {},
  };
  const ctx = {
    calls, state, Core, esc,
    knowledgeCollection: type => (type === 'note' ? 'notes' : 'resources'),
    getArea: id => state.areas.find(area => area.id === id),
    attachmentOwner: ({ ownerType, ownerId }) => { const item = state[ownerType === 'note' ? 'notes' : 'resources'].find(entry => entry.id === ownerId); return item ? { type: ownerType, item } : null; },
    pageHeader: (title, subtitle) => `<header><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    renderAttachmentsSection: () => '', formatDate: value => `D:${value}`,
    $: selector => elements[selector] || null, $$: () => [],
    modalState: null, setModalState: value => { ctx.modalState = value; },
    closePopover: () => calls.push(['closePopover']), flushTextSave() {}, goalFocusTarget() {}, loadOwnerAttachments() {},
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]), menuSheet: (title, body) => `<menu title="${title}">${body}</menu>`,
    renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']), saveAndRender: () => calls.push(['saveAndRender']),
    scheduleTextSave() {}, saveState: () => true, nowIso: () => '2026-10-12T08:00:00.000Z', uid: kind => `${kind}-new`,
    noteToTask: id => calls.push(['noteToTask', id]),
  };
  return { ctx, state, calls, elements };
}
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);

test('A: Beleške and Resursi have their own search over names, text and links; Search stays as it was', () => {
  const module = moduleFor();
  const { ctx, elements } = fixture();
  const list = module.renderRoute({ type: 'notes' }, ctx);
  assert.match(list, /<label class="sheet-search knowledge-search"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input id="knowledge-query" class="input" type="search" autocomplete="off" data-owner-type="note" placeholder="Search notes" aria-label="Search notes" value=""><\/label>/);
  assert.match(list, /<div id="knowledge-results">/);
  const results = { innerHTML: '' }; const subtitle = { textContent: '' };
  elements['#knowledge-results'] = results; elements['#main .page-subtitle'] = subtitle;
  const type = text => module.handleInput({ type: 'input', target: { id: 'knowledge-query', value: text, dataset: { ownerType: 'note' } } }, ctx);
  assert.equal(type('caj'), true, 'without diacritics');
  assert.match(results.innerHTML, /data-route="note\/n2"/);
  assert.doesNotMatch(results.innerHTML, /data-route="note\/n1"/);
  assert.equal(subtitle.textContent, '1 of 2 notes');
  type('sleeping tent');
  assert.match(results.innerHTML, /data-route="note\/n1"/, 'every word, in any order');
  type('example.com');
  assert.match(results.innerHTML, /data-route="note\/n2"/, 'links count');
  type('nothing like this');
  assert.match(results.innerHTML, /Nothing found\. The search looks at names, text and links\./);
  assert.match(module.renderRoute({ type: 'notes' }, ctx), /value="nothing like this"/, 'the words stay while the screen redraws');
  type('');
  assert.ok(sr.includes('"Search notes": "Pretraži beleške"') && sr.includes('"Search resources": "Pretraži resurse"'));
  assert.doesNotMatch(read('js/core.js').slice(read('js/core.js').indexOf('function searchItems')), /knowledgeQuery/, 'global Search unchanged');
});

test('A: the area and tag filter sheets list only what the items use', () => {
  const module = moduleFor();
  const { ctx, calls } = fixture();
  act(module, ctx, 'knowledge-filter', { ownerType: 'note', field: 'areaId' });
  const areas = calls.at(-1)[1];
  assert.match(areas, /data-value="a1"/);
  assert.match(areas, /data-value="__none"/, 'one note has no area');
  assert.doesNotMatch(areas, /data-value="a2"/);
  act(module, ctx, 'knowledge-filter', { ownerType: 'note', field: 'tagId' });
  assert.match(calls.at(-1)[1], /data-value="t1"/);
  assert.doesNotMatch(calls.at(-1)[1], /data-value="t2"/);
  act(module, ctx, 'knowledge-filter', { ownerType: 'resource', field: 'areaId' });
  assert.doesNotMatch(calls.at(-1)[1], /data-value="a1"/, 'no resource uses Travel');
});

test('B: a note becomes a task: list lines become subtasks, the rest stays as notes', () => {
  const draft = Core.noteTaskDraft({ title: 'Packing list', body: 'For the trip\n- tent\n* sleeping bag\n• stove\n[x] map\n1. tickets\n\nBring cash' });
  assert.deepEqual(plain(draft), { title: 'Packing list', notes: 'For the trip\n\nBring cash', subtasks: [{ title: 'tent', isCompleted: false }, { title: 'sleeping bag', isCompleted: false }, { title: 'stove', isCompleted: false }, { title: 'map', isCompleted: true }, { title: 'tickets', isCompleted: false }] });
  assert.deepEqual(plain(Core.noteTaskDraft({ title: '  ', body: 'Only text' })), { title: '', notes: 'Only text', subtasks: [] });
  const module = moduleFor();
  const { ctx, calls } = fixture();
  module.handleAction('open-knowledge', { ownerType: 'note', ownerId: 'n1' }, ctx);
  act(module, ctx, 'knowledge-menu');
  const menu = calls.find(call => call[0] === 'open')[1];
  assert.match(menu, /<button class="popover-option" type="button" data-pop-action="knowledge-make-task" data-owner-id="n1"><i class="ph ph-check-square"><\/i>Make a task<\/button><div class="popover-separator"><\/div><button class="popover-option is-danger"/);
  act(module, ctx, 'knowledge-make-task', { ownerId: 'n1' });
  assert.deepEqual(calls.at(-1), ['noteToTask', 'n1']);
  module.handleAction('open-knowledge', { ownerType: 'resource', ownerId: 'r1' }, ctx);
  act(module, ctx, 'knowledge-menu');
  assert.doesNotMatch(calls.filter(call => call[0] === 'open').at(-1)[1], /knowledge-make-task/, 'only notes');
  assert.ok(sr.includes('"Make a task": "Napravi zadatak"'));
});

test('B: "Napravi zadatak" files an Inbox task with the note\'s area and tags, links it, opens it and offers Poništi', () => {
  const calls = [];
  const note = { id: 'n1', title: 'Packing list', body: 'For the trip\n- tent\n- stove', areaId: 'a1', tagIds: ['t1'], relatedTaskIds: [], updatedAt: 'old' };
  const ctx = withI18n({
    Core, state: { notes: [note], tasks: [] }, calls,
    flushTextSave() {}, nowIso: () => '2026-10-12T08:00:00.000Z', uid: kind => `${kind}-${calls.length}`, nextOrder: () => 7,
    saveState: () => { calls.push(['save']); return true; }, render: () => calls.push(['render']), closePopover() {},
    openTaskDetail: id => calls.push(['open', id]), setUndo: (message, undo) => { calls.push(['undo', message]); ctx.undo = undo; },
  });
  vm.createContext(ctx);
  vm.runInContext(fn('noteToTask'), ctx);
  ctx.noteToTask('n1');
  const task = ctx.state.tasks[0];
  assert.equal(task.title, 'Packing list');
  assert.equal(task.notes, 'For the trip');
  assert.deepEqual(plain(task.subtasks.map(sub => [sub.title, sub.isCompleted, sub.order])), [['tent', false, 0], ['stove', false, 1]]);
  assert.equal(task.isInbox, true); assert.equal(task.inboxOrder, 7); assert.equal(task.areaId, 'a1'); assert.deepEqual(plain(task.tagIds), ['t1']);
  assert.deepEqual(plain(note.relatedTaskIds), [task.id]);
  assert.deepEqual(calls.filter(call => call[0] !== 'save' && call[0] !== 'render'), [['open', task.id], ['undo', 'Task made from the note']]);
  ctx.undo();
  assert.equal(ctx.state.tasks.length, 0);
  assert.deepEqual(plain(note.relatedTaskIds), []);
  assert.ok(sr.includes('"Task made from the note": "Zadatak napravljen iz beleške"'));
});

test('H: a shared link becomes a resource in Inbox; shared text without a link stays a task', () => {
  assert.deepEqual(plain(Core.sharedResourceDraft({ text: 'https://www.example.com/post', subject: 'A good post' })), { title: 'A good post', linkUrls: ['https://www.example.com/post'], description: '' });
  assert.deepEqual(plain(Core.sharedResourceDraft({ text: 'Worth reading https://example.com/x' })), { title: 'Worth reading', linkUrls: ['https://example.com/x'], description: '' });
  assert.deepEqual(plain(Core.sharedResourceDraft({ url: 'https://www.example.com/a', text: 'Line one\nLine two' })), { title: 'example.com', linkUrls: ['https://www.example.com/a'], description: 'Line one\nLine two' });
  assert.equal(Core.sharedResourceDraft({ text: 'Buy milk' }), null);
  assert.equal(Core.sharedResourceDraft({ text: 'javascript:alert(1)' }), null);
  assert.match(fn('handleIncomingLink'), /const resource = Core\.sharedResourceDraft\(params\);\n\s+if \(resource\) openKnowledgeWindow\('resource', null, \{ prefill: resource, inbox: true \}\);\n\s+else openQuickAdd\(Core\.sharedTextDraft\(params\)\);/);
  const module = moduleFor();
  const { ctx } = fixture();
  module.handleAction('open-knowledge', { ownerType: 'resource', ownerId: null, prefill: { title: 'A good post', linkUrls: ['https://example.com/post'], description: 'Note' }, inbox: true }, ctx);
  assert.equal(ctx.modalState.inbox, true);
  assert.equal(ctx.modalState.draft.title, 'A good post');
  assert.deepEqual(plain(ctx.modalState.draft.linkUrls), ['https://example.com/post']);
  assert.equal(ctx.modalState.draft.text, 'Note');
});

test('H: a resource row shows its site and opens its link', () => {
  const module = moduleFor();
  const { ctx } = fixture();
  const html = module.renderRoute({ type: 'resources' }, ctx);
  assert.match(html, /<span class="task-meta">Article · Unread · example\.org<\/span>/);
  assert.match(html, /<a class="btn-icon knowledge-row-link" href="https:\/\/www\.example\.org\/guide" target="_blank" rel="noopener noreferrer" aria-label="Open link: example\.org"><i class="ph ph-arrow-square-out" aria-hidden="true"><\/i><\/a>/);
  assert.ok(read('css/styles.css').includes('.knowledge-row-link'));
});

test('I: favorite notes are pinned to Još', () => {
  assert.match(fn('renderMoreScreen'), /\.\.\.\(state\.notes \|\| \[\]\)\.filter\(note => note\.favorite\)\.sort\(\(a, b\) => String\(b\.updatedAt\)\.localeCompare\(String\(a\.updatedAt\)\)\)\.slice\(0, 4\)\.map\(note => moreRow\(`note\/\$\{encodeURIComponent\(note\.id\)\}`, 'ph-note', note\.title, '', tr\('Note'\)\)\),/);
});

test('R35 is released as 2.0.0-alpha.61', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.61');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.61';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.61');
});
