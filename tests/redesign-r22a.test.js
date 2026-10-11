// Redesign R22a: the second design audit, fixes 7–9 and 11 — back links, narrow phones, touch targets, the "+"
// clearance and the journal strip on today.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r22a-navigation-touch.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const layerStart = css.indexOf('/* Redesign R22a');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};

function trail() {
  const ctx = { esc, renderedRoute: null, renderedTitle: '' };
  vm.createContext(ctx);
  vm.runInContext(`var ROOT_ROUTES = ${app.match(/const ROOT_ROUTES = (\[[^\]]+\]);/)[1]}; var screenTrail = [];\n${fn('trackScreen')}\n${fn('backLink')}`, ctx);
  const go = (route, title) => { ctx.trackScreen(route); ctx.renderedRoute = route; ctx.renderedTitle = title; };
  return { ctx, go };
}

test('the R22a layer comes after R21', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R21'));
});

test('7: "‹ …" returns to the screen a detail screen was opened from', () => {
  const { ctx, go } = trail();
  go('#today', 'Danas');
  go('#project/p1', 'Posao');
  assert.equal(ctx.backLink('tasks', 'Zadaci'), '<div class="screen-topbar"><button class="screen-back" type="button" data-route="today"><i class="ph ph-caret-left" aria-hidden="true"></i>Danas</button></div>');
  go('#tag/t1', 'hitno');
  assert.match(ctx.backLink('tags', 'Oznake'), /data-route="project\/p1"><i class="ph ph-caret-left" aria-hidden="true"><\/i>Posao</);
  go('#project/p1', 'Posao');
  assert.match(ctx.backLink('tasks', 'Zadaci'), /data-route="today">.*Danas</, 'going back pops the trail instead of looping');
  go('#tasks', 'Zadaci');
  go('#project/p2', 'Kuća');
  assert.match(ctx.backLink('tasks', 'Zadaci'), /data-route="tasks">.*Zadaci</, 'a bottom-bar tab starts the trail over');
  const fresh = trail();
  assert.match(fresh.ctx.backLink('areas', 'Oblasti'), /data-route="areas">.*Oblasti</, 'opened directly: the screen\'s parent');
});

test('7: the project, "Bez projekta", tag, area and saved view screens have the back link', () => {
  assert.match(fn('render'), /const route = location\.hash \|\| '#today';\n\s+trackScreen\(route\);\n\s+renderView\(\);/);
  assert.match(fn('announceRoute'), /renderedTitle = name \|\| '';/);
  assert.match(fn('domainContext'), /\n      backLink,\n/);
  const projects = read('js/projects-ui.js');
  assert.equal((projects.match(/ctx\.backLink\('tasks', tr\('Tasks'\)\) \+ ctx\.pageHeader\(/g) || []).length, 2);
  assert.doesNotMatch(projects, /const backLink = /);
  assert.match(fn('renderTag'), /let html = backLink\('tags', tr\('Tags'\)\) \+ pageHeader\(tag\.name/);
  assert.match(read('js/areas-ui.js'), /let html = ctx\.backLink\('areas', tr\('Areas'\)\) \+ pageHeader\(area\.name/);
  assert.match(read('js/saved-views-ui.js'), /const header = context\.backLink\('saved-views', tr\('Saved Views'\)\) \+ pageHeader\(view\.name/);
});

test('8: segments, the habit week table and the bottom bar fit a 320 px phone', () => {
  const narrow = layer.slice(layer.indexOf('@media (max-width: 400px)'));
  assert.match(narrow, /\.habit-window-seg \.btn \{ flex: 1 1 0; min-width: 0; padding-inline: 2px; font-size: 13px; line-height: 1\.15; white-space: normal; \}/);
  assert.match(narrow, /\.habits-week-table \.habits-week-name \{ max-width: 64px; \}/);
  assert.match(narrow, /\.habit-cell \{ width: 32px; height: 32px; \}/);
  assert.match(narrow, /\.mobile-bottom-nav-item \{ padding-inline: 1px; font-size: 10px; \}/);
  assert.match(narrow, /\.mobile-bottom-nav-item span \{ max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
});

test('9: icon buttons, the toast action and color swatches are 44 px on touch screens; the habit cell keeps a small ring in a bigger target', () => {
  const touch = layer.slice(layer.indexOf('@media (max-width: 700px), (pointer: coarse)'));
  assert.match(touch, /\.btn-icon \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(touch, /\.toast-action \{ min-height: 44px; padding: 0 12px; \}/);
  assert.match(touch, /\.color-swatch \{ width: 40px; height: 40px; \}/);
  assert.match(rule('.habit-cell'), /position: relative; width: 36px; height: 36px; border: 0; background: none;/);
  assert.match(rule('.habit-cell::before'), /inset: 5px; border: 2px solid var\(--line-2\); border-radius: 50%;/);
  assert.match(rule('.habit-cell.is-done::before'), /border-color: var\(--success\); background: var\(--success\);/);
});

test('9: the last row\'s check is never under the "+"', () => {
  assert.match(rule('.main'), /padding-bottom: calc\(136px \+ env\(safe-area-inset-bottom\)\);/);
});

test('11: the journal strip opens on today and keeps its place when the screen redraws', () => {
  const journal = read('js/journal-ui.js');
  assert.match(journal, /<div class="journal-strip" data-month="\$\{month\}">/);
  assert.match(journal, /const keep = old && old\.dataset\.month === month \? old\.scrollLeft : null;/);
  assert.match(journal, /const day = strip\.querySelector\('\.journal-day\.is-today'\);/);
  assert.match(journal, /placeStrip\(month\);/);
});

test('R22a shipped as 2.0.0-alpha.45 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 45);
});
