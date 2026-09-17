const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('keyboard-focused links receive the shared compact focus ring', () => {
  assert.match(css, /button:focus-visible,\s*a:focus-visible,\s*input:focus-visible,\s*textarea:focus-visible,\s*\[tabindex\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*var\(--focus-ring\)/);
});
