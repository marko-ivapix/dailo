const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('keyboard-focused links receive the shared compact focus ring', () => {
  assert.match(css, /button:focus-visible,\s*a:focus-visible,\s*input:focus-visible,\s*textarea:focus-visible,\s*\[tabindex\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*var\(--focus-ring\)/);
});

test('mobile completion hit areas keep the compact row layout aligned', () => {
  assert.match(css, /\.task-row \{ grid-template-columns: minmax\(0, 1fr\) 44px; \}/);
  assert.match(css, /\.subtask-row \{ grid-template-columns: 44px minmax\(0, 1fr\) auto; \}/);
  assert.doesNotMatch(css, /font: 500 14px\/1 var\(--font-body\)/);
});
