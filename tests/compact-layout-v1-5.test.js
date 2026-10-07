const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('global compact density tokens keep the desktop workspace tight', () => {
  assert.match(css, /--content-gutter:\s*20px/);
  assert.match(css, /--control-height:\s*32px/);
  assert.match(css, /--task-min-height:\s*44px/);
  assert.match(css, /\.modal-inner\s*\{\s*padding:\s*14px/);
  assert.match(css, /\.task-title\s*\{[^}]*font-size:\s*14px/);
});
