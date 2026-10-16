// R56: where a function lives is no longer only js/app.js. `functionSource(name)` finds a top-level function of the
// app (two-space indent inside its module) in any js/*.js file, so code can move into modules without rewriting the
// tests that run it; `appSource()` is the app's code across its split files, for assertions on the whole.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// js/app.js and the modules split out of it, in load order.
const APP_FILES = ['js/sidebar-ui.js', 'js/drag-ui.js', 'js/app.js'];
const ALL_FILES = fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).map(name => `js/${name}`);

const appSource = () => APP_FILES.map(read).join('\n');

function functionSource(name, files = ALL_FILES) {
  for (const file of files) {
    const source = read(file);
    const match = new RegExp(`\\n  (async )?function ${name}\\(`).exec(source);
    if (!match) continue;
    const start = match.index + 1;
    const end = source.indexOf('\n  }\n', start);
    if (end > start) return { file, source: source.slice(start, end + 4) };
  }
  throw new Error(`function ${name} not found`);
}

module.exports = { APP_FILES, appSource, functionSource };
