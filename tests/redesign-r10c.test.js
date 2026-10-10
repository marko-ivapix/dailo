// Redesign R10c: Oznake (S6).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10c-tags.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));

function appContext(extra = {}) {
  const calls = [];
  const state = {
    tags: [{ id: 't2', name: 'Later', color: '#2fbf71' }, { id: 't1', name: 'Errands', color: '#4f8cff' }],
    tasks: [
      { id: 't-open', title: 'Buy milk', tagIds: ['t1'], isCompleted: false },
      { id: 't-done', title: 'Old', tagIds: ['t1'], isCompleted: true },
      { id: 't-arch', title: 'Hidden', tagIds: ['t1'], projectId: 'p-arch', isCompleted: false },
    ],
    projects: [{ id: 'p-arch', name: 'Past', isArchived: true }],
    notes: [{ id: 'n1', title: 'Shopping', tagIds: ['t1'], updatedAt: '2026-10-01T10:00:00.000Z' }],
    resources: [],
    ui: {},
    ...extra.state,
  };
  const ctx = {
    calls, state, Core, esc,
    PROJECT_COLORS: ['#4f8cff', '#2fbf71', '#e5484d'],
    modalState: null,
    getTag: id => state.tags.find(tag => tag.id === id) || null,
    listTasks: () => state.tasks.filter(task => !state.projects.some(project => project.isArchived && project.id === task.projectId)),
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}">${options?.actionHtml || ''}</header>`,
    emptyState: (title, text, cta, action) => `<empty ${title} | ${text}${action ? ` ${action}` : ''}>`,
    taskRow: (task, context, options) => `<row ${task.id} ${context}${options?.today ? ' today' : ''}>`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    captureModalReturnFocus() {}, closePopover() {}, requestAnimationFrame: run => run(), $: () => null,
    renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']),
    closeModal: () => { calls.push(['closeModal']); ctx.modalState = null; },
    saveState: () => { calls.push(['save']); return true; },
    setToastMessage: message => calls.push(['toast', message]),
    nowIso: () => '2026-10-10T08:00:00.000Z', uid: kind => `${kind}-new`,
    ...extra.ctx,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(['tagLibrary', 'libraryRow', 'tagUsage', 'renderTags', 'renderTag', 'openTagModal', 'renderTagModal', 'saveTagModal'].map(fn).join('\n'), ctx);
  // `modalState` is a `let` in app.js; the sliced functions read and write the context's binding.
  return ctx;
}

test('S6: "Oznake" lists the tags by name with what uses them, and "+ Nova oznaka"', () => {
  const ctx = appContext();
  const html = ctx.renderTags();
  assert.match(html, /^<header title="Tags" subtitle="2 tags"><\/header><div class="today-card tags-list">/);
  assert.deepEqual([...html.matchAll(/data-route="tag\/(\w+)"/g)].map(match => match[1]), ['t1', 't2'], 'by name');
  // R17: list rows lost the "›" arrow.
  assert.match(html, /<button class="tag-list-row" type="button" data-route="tag\/t1"><span class="tag-dot" style="--tag-color:#4f8cff" aria-hidden="true"><\/span><span class="tag-list-main"><span class="task-title">Errands<\/span><span class="task-meta">1 task · 1 in the library<\/span><\/span><\/button>/);
  assert.match(html, /data-route="tag\/t2">[\s\S]*?<span class="task-meta">Not in use<\/span>/);
  assert.match(html, /<button class="inline-add" type="button" data-action="new-tag"><i class="ph ph-plus" aria-hidden="true"><\/i> New tag<\/button><\/div>$/);
  assert.doesNotMatch(html, /tags-layout|select-tag|selected-tag/);
  assert.equal(appContext({ state: { tags: [] } }).renderTags(), '<header title="Tags" subtitle="0 tags"></header><empty No tags yet. | Create a global tag and reuse it across tasks. new-tag>');
});

test('S6: a tag screen shows its active tasks, its library items and the menu', () => {
  const ctx = appContext();
  const html = ctx.renderTag('t1');
  assert.equal(html, '<header title="Errands" subtitle="1 active task"><button class="btn-icon" type="button" data-action="tag-menu" data-tag-id="t1" aria-label="Tag actions"><i class="ph ph-dots-three"></i></button></header><div class="task-list today-card"><row t-open tags today></div><section class="section tag-library"><div class="section-header"><h2 class="section-label">In the library · 1</h2></div><div class="today-card"><div class="today-row area-library-row"><button class="today-row-main" type="button" data-route="note/n1"><span class="task-title"><i class="ph ph-note" aria-hidden="true"></i> Shopping</span><span class="task-meta">Note</span></button></div></div></section>');
  assert.match(ctx.renderTag('t2'), /<header title="Later" subtitle="0 active tasks">[\s\S]*<\/header><empty No active tasks with this tag\. \| Assign it with #tag in Quick Add or in the task window\.>$/);
  assert.match(ctx.renderTag('missing'), /^<header title="Tags"/, 'a deleted tag shows Oznake');
});

test('S6: the tag window has the big name field, Boja and one big button; names stay unique', () => {
  const ctx = appContext();
  ctx.openTagModal();
  let html = ctx.renderTagModal();
  assert.equal(html, `<frame quick><div class="modal-inner quick-sheet tag-window"><div class="modal-header"><h2 class="modal-title">New tag</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><input id="tag-name" class="quick-title-input" type="text" maxlength="80" autocomplete="off" placeholder="Tag name" value="" aria-label="Tag name"><span class="habit-window-label">Color</span><div class="color-grid">${['#4f8cff', '#2fbf71', '#e5484d'].map(color => `<button class="color-swatch${color === '#e5484d' ? ' is-selected' : ''}" type="button" data-action="select-tag-color" data-color="${color}" style="--swatch:${color}" aria-label="Select color" aria-pressed="${color === '#e5484d'}"></button>`).join('')}</div><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-tag">Create tag</button></div></div></frame>`);
  ctx.saveTagModal();
  assert.equal(ctx.modalState.error, 'Tag needs a name.');
  assert.match(ctx.renderTagModal(), /<input id="tag-name" class="quick-title-input is-error"[^>]*><div class="validation" role="alert">Tag needs a name\.<\/div>/);
  ctx.modalState.draft.name = 'errands';
  ctx.saveTagModal();
  assert.equal(ctx.modalState.error, 'A tag with this name already exists.');
  ctx.modalState.draft.name = ' Home ';
  ctx.saveTagModal();
  assert.deepEqual(plain(ctx.state.tags.at(-1)), { id: 'tag-new', name: 'Home', color: '#e5484d', createdAt: '2026-10-10T08:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z' });
  assert.deepEqual(plain(ctx.calls.slice(-4)), [['save'], ['closeModal'], ['render'], ['toast', 'Tag “Home” created']]);
  assert.equal(ctx.state.ui.selectedTagId, undefined);
  const edit = appContext();
  edit.openTagModal('t2');
  html = edit.renderTagModal();
  assert.match(html, /<h2 class="modal-title">Edit tag<\/h2>[\s\S]*value="Later"[\s\S]*data-action="save-tag">Save changes<\/button>/);
  edit.modalState.draft.name = 'Someday';
  edit.saveTagModal();
  assert.equal(edit.state.tags[0].name, 'Someday');
  assert.ok(!edit.calls.some(call => call[0] === 'toast'));
});

test('app.js: the tag route, the floating "+" on Oznake and the removed selection', () => {
  assert.match(fn('currentRoute'), /if \(hash\.startsWith\('tag\/'\)\) \{\n\s+const id = decodeURIComponent\(hash\.slice\('tag\/'\.length\)\);\n\s+return getTag\(id\) \? \{ type: 'tag', id \} : \{ type: 'tags' \};\n\s+\}/);
  assert.match(fn('renderMain'), /else if \(route\.type === 'tag'\) content = renderTag\(route\.id\);/);
  assert.match(app, /'#tags': \[msg\('New tag'\), \(\) => openTagModal\(\)\]/);
  assert.doesNotMatch(app, /selectedTagId|'select-tag'|data-action="new-tag"><i class="ph ph-plus"><\/i>/);
});

test('the R10c layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10c'));
  assert.ok(layer.length > 20, 'R10c layer');
  for (const selector of ['.tag-list-row', '.tag-list-main', '.tag-library', '.tag-window .quick-title-input']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Not in use', 'Nije u upotrebi'], ['In the library', 'U biblioteci'], ['Tag “{name}” created', 'Oznaka „{name}“ je napravljena'], ['Create tag', 'Napravi oznaku'], ['Assign it with #tag in Quick Add or in the task window.', 'Dodeli je kroz brzo dodavanje (#oznaka) ili u prozoru zadatka.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"\{count\} tags": \{ one: "\{count\} oznaka", few: "\{count\} oznake", other: "\{count\} oznaka" \}/);
});

test('R10c shipped as 2.0.0-alpha.21 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 21);
});
