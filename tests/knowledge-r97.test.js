// R97: Beleške i resursi. A note can link to projects and goals like a resource does (note.relatedProjectIds and
// note.relatedGoalIds, stored once a link is set); the project screen and the goal details list the notes and resources
// linked to them. A link shows as a card with its site and the rest of its address — nothing is fetched from it — and a
// note's row names the site of its first web link with a button that opens it.
// Data-model spec: docs/superpowers/specs/2026-10-15-r97-knowledge-links.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stamp = '2026-10-01T08:00:00.000Z';
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const note = (id, fields = {}) => ({ id, title: id, body: '', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], favorite: false, clip: '', createdAt: stamp, updatedAt: stamp, ...fields });
const project = id => ({ id, name: id, color: '#5362FF', areaId: null, goalIds: [], isArchived: false, archivedAt: null, order: 0, createdAt: stamp, updatedAt: stamp });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('backups check a note\'s links to projects and goals; sync carries them; a missing project is dropped on load', () => {
  Backup.validateDomain(emptyState({ projects: [project('p')], notes: [note('n', { relatedProjectIds: ['p'], relatedGoalIds: [] })] }), [], []);
  Backup.validateDomain(emptyState({ notes: [note('old')] }), [], []);
  assert.throws(() => Backup.validateDomain(emptyState({ notes: [note('n', { relatedProjectIds: ['gone'] })] }), [], []), /Invalid backup/);
  assert.throws(() => Backup.validateDomain(emptyState({ notes: [note('n', { relatedGoalIds: 'g' })] }), [], []), /Invalid backup: relatedGoalIds/);
  assert.deepEqual(Sync.collectRecords(emptyState({ notes: [note('n', { relatedProjectIds: ['p'] })] }), []).get('notes/n').data.relatedProjectIds, ['p']);
  const state = Core.normalizeState(emptyState({ projects: [project('p')], notes: [note('n', { relatedProjectIds: ['p', 'gone'] }), note('old')] }));
  assert.deepEqual(state.notes[0].relatedProjectIds, ['p']);
  assert.equal(Object.hasOwn(state.notes[1], 'relatedProjectIds'), false, 'an older note keeps no field');
});

function knowledge() {
  let module;
  runInNewContextWithI18n(read('js/knowledge.js'), { window: { TodoDomainModules: { register: value => { module = value; } } }, URL });
  return module;
}

test('the note window offers Projects and Goals; a link is a card with its site', () => {
  const source = read('js/knowledge.js');
  assert.match(source, /const NOTE_RELATIONS = RELATIONS\.filter\(\(\[field\]\) => \['relatedProjectIds', 'relatedGoalIds'\]\.includes\(field\)\);/);
  assert.match(source, /const relations = relationsFor\(type\)\.map\(/);
  assert.match(source, /if \(type === 'note'\) for \(const \[field\] of NOTE_RELATIONS\) if \(d\[field\]\.length \|\| Object\.hasOwn\(item, field\)\) item\[field\] = \[\.\.\.d\[field\]\];/);
  const link = functionSource('linkHtml', ['js/knowledge.js']).source;
  assert.match(link, /<a class="knowledge-link-card" href="\$\{esc\(url\)\}" target="_blank" rel="noopener noreferrer">/);
  const module = knowledge();
  const state = { notes: [note('n', { linkUrls: ['https://www.example.com/clanak/1?x=2'], relatedProjectIds: ['p'] })], resources: [], tags: [], projects: [project('p')], goals: [] };
  const ctx = { state, esc, getArea: () => null, knowledgeCollection: type => (type === 'note' ? 'notes' : 'resources') };
  const linked = module.renderRoute({ type: 'knowledge-linked', field: 'relatedProjectIds', id: 'p', style: 'section' }, ctx);
  assert.match(linked, /^<section class="section knowledge-linked"><div class="section-header"><h2 class="section-label">Notes and resources<\/h2><span class="section-count">1<\/span><\/div><div class="today-card">/);
  assert.match(linked, /data-route="note\/n"/);
  assert.match(linked, /<span class="task-meta">No area · example\.com<\/span>/, 'a note names the site of its first link');
  assert.match(linked, /<a class="btn-icon knowledge-row-link" href="https:\/\/www\.example\.com\/clanak\/1\?x=2"/);
  assert.equal(module.renderRoute({ type: 'knowledge-linked', field: 'relatedProjectIds', id: 'other', style: 'section' }, ctx), '', 'nothing linked, nothing shown');
  assert.match(module.renderRoute({ type: 'knowledge-linked', field: 'relatedProjectIds', id: 'p', style: 'label' }, ctx), /^<h3 class="goal-details-label">Notes and resources · 1<\/h3><div class="today-card knowledge-linked-card">/);
});

test('the project screen and the goal details list what is linked to them', () => {
  assert.match(read('js/app.js'), /linkedKnowledgeHtml\(field, id, style\) \{ return callDomainHook\('renderRoute', \{ type: 'knowledge-linked', field, id, style \}\) \|\| ''; \},/);
  assert.match(functionSource('renderProject', ['js/projects-ui.js']).source, /html \+= ctx\.linkedKnowledgeHtml\?\.\('relatedProjectIds', projectId, 'section'\) \|\| '';/);
  assert.match(functionSource('renderGoalDetails', ['js/goals-ui.js']).source, /html \+= ctx\.linkedKnowledgeHtml\?\.\('relatedGoalIds', goal\.id, 'label'\) \|\| '';/);
});

test('deleting a project or goal takes it out of notes too, and Poništi brings it back', () => {
  const effects = functionSource('buildDeleteSnapshot').source;
  assert.match(effects, /for \(const note of state\.notes \|\| \[\]\) \{\n\s+const field = \{ project: 'relatedProjectIds', goal: 'relatedGoalIds' \}\[type\];\n\s+if \(field\) arrayEffect\('notes', note, field, id => id === identity\);\n\s+\}/);
  const css = read('css/styles.css');
  for (const rule of ['.knowledge-link-card {', '.knowledge-link-card-text {', '.knowledge-link-card small {', '.knowledge-linked {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide mentions the links', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Notes and resources', 'Beleške i resursi'], ['A related item changed. Reopen this note before saving.', 'Povezana stavka se promenila. Ponovo otvori belešku pre čuvanja.']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('Beleška i resurs mogu da se povežu sa projektom i ciljem (prozor beleške, <strong>Organizacija</strong>), a povezane vidiš na ekranu projekta i u detaljima cilja. Link se prikazuje kao kartica sa imenom sajta.'));
});

test('R97 is released as 2.0.0-alpha.124', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.124');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.124';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.124');
});
