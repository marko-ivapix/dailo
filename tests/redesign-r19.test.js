// Redesign R19: the filter chips on Redovne obaveze, Završeni zadaci, Beleške and Resursi as pills.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r19-filter-chips.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const layerStart = css.indexOf('/* Redesign R19');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const ROWS = ':is(.cleaning-chips, .completed-chips, .knowledge-chips)';
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};

test('the three chip rows are pills inside a 44 px touch height', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R18') || layerStart > css.indexOf('/* Redesign R17'), 'after the earlier layers');
  assert.match(rule(ROWS), /gap: 8px;/);
  const chip = rule(`${ROWS} .quick-chip`);
  for (const part of ['position: relative', 'isolation: isolate', 'display: inline-flex', 'min-height: 44px', 'padding: 0 14px', 'border: 0', 'background: none', 'color: var(--ink-2)', 'font-size: var(--text-base)']) assert.ok(chip.includes(part), part);
  const pill = rule(`${ROWS} .quick-chip::before`);
  for (const part of ['inset: 4px 0', 'z-index: -1', 'border: 1px solid var(--line-2)', 'border-radius: 999px', 'background: var(--graphite-850)']) assert.ok(pill.includes(part), part);
  assert.match(rule(`${ROWS} .quick-chip:hover::before`), /border-color: var\(--line-3\); background: var\(--graphite-800\);/);
});

test('the selected chip is filled with the accent and "+ Grupa" is dashed', () => {
  assert.match(rule(`${ROWS} .quick-chip.is-selected`), /color: var\(--on-accent\);/);
  assert.match(rule(`${ROWS} .quick-chip.is-selected::before`), /border-color: var\(--blue-600\); background: var\(--blue-600\);/);
  assert.match(rule('.cleaning-chips .cleaning-add-group'), /color: var\(--blue-300\);/);
  assert.match(rule('.cleaning-chips .cleaning-add-group::before'), /border-style: dashed; border-color: var\(--blue-300\); background: none;/);
});

test('R19 shipped as 2.0.0-alpha.42 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 42);
});
