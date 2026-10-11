// Redesign R21: the old windows reachable from the new ones become sheets with one big button (second design audit, fix 3).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r21-old-windows.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const body = (file, name) => {
  const source = read(file);
  const start = source.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1;
  assert.ok(start > 0, `${file} ${name}`);
  return source.slice(start, source.indexOf('\n  }\n', start) + 4);
};
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const layerStart = css.indexOf('/* Redesign R21');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};

const WINDOWS = [
  ['js/goals-ui.js', 'renderGoalSourceModal', 'goal-source-window', 'save-goal-source'],
  ['js/goals-ui.js', 'renderMilestoneModal', 'milestone-window', 'save-milestone'],
  ['js/goals-ui.js', 'renderGoalLinksModal', 'goal-links-window', 'save-goal-links'],
  ['js/goals-ui.js', 'renderGoalRemindersModal', 'goal-reminders-window', 'save-goal-reminders'],
  ['js/habits-ui.js', 'renderHabitValueModal', 'habit-value-window', 'habit-value-apply'],
  ['js/templates-ui.js', 'renderTemplateModal', 'template-window', 'save-template'],
];

test('the R21 layer comes after R20', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R20'));
});

test('each form window is a bottom sheet with one big button and no Cancel / Save footer', () => {
  for (const [file, name, cls, action] of WINDOWS) {
    const source = body(file, name);
    assert.match(source, new RegExp(`<div class="modal-inner quick-sheet ${cls}">`), `${name} is a sheet`);
    assert.match(source, new RegExp(`<div class="quick-sheet-footer">[^]*?<button class="btn btn-primary habit-window-save" type="button" data-action="${action}"`), `${name} has one big button`);
    assert.doesNotMatch(source, /modal-footer|field-label/, `${name} has no old footer or labels`);
    assert.doesNotMatch(source, /data-action="close-modal">\$\{tr\('Cancel'\)\}/, `${name} closes with its X`);
    assert.match(source, /, 'quick[ '"]/, `${name} opens as a sheet at every width`);
  }
});

test('the choice windows are sheets with full-width buttons, the main one first', () => {
  const reached = body('js/goals-ui.js', 'renderGoalReachedModal');
  assert.match(reached, /<div class="modal-inner quick-sheet choice-window">/);
  assert.match(reached, /<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="complete-goal"[^>]*>\$\{tr\('Mark completed'\)\}<\/button><button class="btn btn-secondary" type="button" data-action="keep-goal-active">/);
  const finished = body('js/habits-ui.js', 'renderHabitFinishedModal');
  assert.match(finished, /<div class="modal-inner quick-sheet choice-window">/);
  assert.match(finished, /<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="archive-habit"/);
  const duplicate = body('js/app.js', 'renderDuplicateModal');
  assert.match(duplicate, /<div class="modal-inner quick-sheet choice-window">/);
  assert.match(duplicate, /<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="duplicate-with-files"[^>]*>\$\{tr\('Copy files'\)\}<\/button><button class="btn btn-secondary" type="button" data-action="duplicate-without-files"/);
  for (const source of [reached, finished, duplicate]) assert.doesNotMatch(source, /modal-footer|'small-modal'/);
  assert.match(rule('.sheet-actions'), /display: grid; gap: 8px;/);
  assert.match(rule('.sheet-actions .btn'), /width: 100%; min-height: 48px; font-size: 16px;/);
});

test('the goal history and the finished sorting close with their X or one big button', () => {
  const history = body('js/goals-ui.js', 'renderGoalHistoryModal');
  assert.match(history, /<div class="modal-inner quick-sheet goal-history-window">/);
  assert.doesNotMatch(history, /modal-footer|field-label/);
  assert.match(history, /<label class="sheet-label" for="goal-history-range">/);
  const triage = body('js/app.js', 'renderInboxTriage');
  assert.doesNotMatch(triage, /modal-footer/);
  assert.match(triage, /<div class="quick-sheet-footer"><button class="btn btn-primary habit-window-save" type="button" data-action="close-modal">\$\{tr\('Close'\)\}<\/button><\/div>/);
});

test('fields in sheets have the new label, check rows and the milestone title as a big field', () => {
  assert.match(body('js/goals-ui.js', 'goalSourceFields'), /^(?![^]*field-label)[^]*<label class="sheet-label">\$\{tr\('Progress source'\)\}/);
  const milestone = body('js/goals-ui.js', 'renderMilestoneModal');
  assert.match(milestone, /<input id="milestone-title" class="input quick-title-input" maxlength="120"/);
  assert.match(milestone, /<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"><\/i><span>\$\{tr\('Date'\)\}<\/span><input id="milestone-date"/);
  assert.match(milestone, /class="btn btn-ghost is-danger goal-milestone-delete"/);
  const reminders = body('js/goals-ui.js', 'renderGoalRemindersModal');
  assert.match(reminders, /<div class="sheet-card"><label class="sheet-check-row"><input id="goal-reminder-7" type="checkbox"/);
  assert.match(reminders, /<label class="sheet-field"><i class="ph ph-clock" aria-hidden="true"><\/i><span>\$\{tr\('Shared reminder time'\)\}<\/span><input id="goal-reminder-time"/);
  const links = body('js/goals-ui.js', 'renderGoalLinksModal');
  assert.match(links, /<h3 class="sheet-group-title">\$\{tr\('Projects'\)\}<\/h3>\$\{projects \? `<div class="sheet-card">\$\{projects\}<\/div>` : `<p class="sheet-note">/);
  assert.match(links, /<label class="sheet-check-row"><input type="checkbox" data-goal-link-task=/);
  const value = body('js/habits-ui.js', 'renderHabitValueModal');
  assert.match(value, /<label class="sheet-field"><i class="ph ph-hash" aria-hidden="true"><\/i><span>\$\{tr\('Total for the day'\)\}<\/span><input id="habit-value-total"/);
  assert.match(value, /'quick habit-value-modal'/);
  assert.match(rule('.sheet-label'), /display: grid; gap: 6px;/);
  assert.match(rule('.sheet-check-row'), /min-height: 48px;/);
});

test('the template editor: a big name field, chips instead of multi-selects and "0 = Sun"', () => {
  const editor = body('js/templates-ui.js', 'renderTemplateModal');
  assert.match(editor, /<input id="template-name" class="input quick-title-input" value="\$\{esc\(draft\.name\)\}" placeholder="\$\{tr\('Template name'\)\}" aria-label="\$\{tr\('Template name'\)\}">/);
  const ctx = withI18n({ esc });
  vm.createContext(ctx);
  const templatesSource = read('js/templates-ui.js');
  vm.runInContext(`${templatesSource.match(/const WEEKDAY_CHOICES = [^\n]+/)[0].replace('const ', 'var ')}\nvar msg = text => text;\n${body('js/templates-ui.js', 'templateField')}`, ctx);
  const field = (data, key, label, kind, options) => ctx.templateField({ esc }, data, key, label, kind, options, '');
  assert.equal(field({ title: 'A' }, 'title', 'Title'), '<label class="sheet-label"><span>Title</span><input class="input" data-template-field="title" data-template-kind="text" type="text"  value="A"></label>');
  const goals = field({ goalIds: ['g2'] }, 'goalIds', 'Goal links', 'ids', [['g1', 'Run'], ['g2', 'Read']]);
  assert.equal(goals, '<div class="sheet-label"><span>Goal links</span><div class="sheet-chips" role="group" aria-label="Goal links" data-template-field="goalIds" data-template-kind="ids"><button class="quick-chip" type="button" data-action="template-chip" data-value="g1" aria-pressed="false">Run</button><button class="quick-chip is-selected" type="button" data-action="template-chip" data-value="g2" aria-pressed="true">Read</button></div></div>');
  const days = field({ weekdays: [1, 3] }, 'weekdays', 'Days', 'weekdays');
  assert.match(days, /^<div class="sheet-label"><span>Days<\/span><div class="sheet-chips" role="group" aria-label="Days" data-template-field="weekdays" data-template-kind="weekdays">/);
  assert.deepEqual([...days.matchAll(/data-value="(\d)" aria-pressed="(\w+)">([^<]+)</g)].map(match => match.slice(1)), [['1', 'true', 'Mon'], ['2', 'false', 'Tue'], ['3', 'true', 'Wed'], ['4', 'false', 'Thu'], ['5', 'false', 'Fri'], ['6', 'false', 'Sat'], ['0', 'false', 'Sun']]);
  assert.match(field({ none: [] }, 'goalIds', 'Goal links', 'ids', []), /<p class="sheet-note">/, 'an empty choice says so');
  const fields = body('js/templates-ui.js', 'templateFields');
  assert.doesNotMatch(fields, /select multiple|0 = Sun/);
  assert.match(fields, /field\('weekdays', tr\('Weekdays'\), 'weekdays'\)/);
  const readDraft = body('js/templates-ui.js', 'readDraft');
  assert.match(readDraft, /\[\.\.\.input\.querySelectorAll\('\[aria-pressed="true"\]'\)\]\.map\(chip => kind === 'ids' \? chip\.dataset\.value : Number\(chip\.dataset\.value\)\)/);
  const templates = read('js/templates-ui.js');
  assert.match(templates, /else if \(action === 'template-chip'\) \{\n\s+const on = element\.getAttribute\('aria-pressed'\) !== 'true';\n\s+element\.setAttribute\('aria-pressed', String\(on\)\); element\.classList\.toggle\('is-selected', on\);/);
  assert.match(templates, /if \(element\.closest\('\[data-template-field\]'\)\?\.dataset\.templateField\.endsWith\('goalIds'\)\) \{ readDraft\(ctx\); ctx\.renderModal\(\); \}/, 'the goal link settings follow the chips');
});

test('the template picker lists templates as rows in one card', () => {
  const picker = body('js/app.js', 'renderTemplatePicker');
  assert.match(picker, /<div class="modal-inner quick-sheet template-picker-window">/);
  assert.match(picker, /<div class="sheet-card">\$\{rows\.map\(t=>`<button class="sheet-row template-choice" type="button" data-action="choose-template" data-template-id="\$\{esc\(t\.id\)\}"><i class="ph ph-copy" aria-hidden="true"><\/i><span>\$\{esc\(t\.name\)\}<\/span><\/button>`\)\.join\(''\)\}<\/div>/);
  assert.match(rule('.sheet-row'), /min-height: 56px;/);
});

test('the unused "Nova navika / Novi cilj" name window of the old area screen is gone', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /AreaLinked|area-linked/);
});

test('R21 shipped as 2.0.0-alpha.44 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 44);
});
