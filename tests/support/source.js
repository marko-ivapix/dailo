// R56: where a function lives is no longer only js/app.js. `functionSource(name)` finds a top-level function of the
// app (two-space indent inside its module) in any js/*.js file, so code can move into modules without rewriting the
// tests that run it; `appSource()` is the app's code across its split files, for assertions on the whole.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// js/app.js and the modules split out of it, in load order.
const APP_FILES = ['js/sidebar-ui.js', 'js/drag-ui.js', 'js/quick-add-ui.js', 'js/app.js'];
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

// R111: the keys of the object domainContext() returns, read from its lines at six spaces (`name,`, `get name()`,
// `name(…) {`, `name: …`), so a module's test can check that every helper it takes is there.
function contextKeys() {
  const keys = new Set();
  for (const line of functionSource('domainContext').source.split('\n')) {
    if (!/^      [^\s/]/.test(line)) continue;
    // Split at the commas outside brackets and quotes, so `name: value => (…)` stays one part.
    const parts = [];
    let depth = 0, quote = null, part = '';
    for (const char of line.trim()) {
      if (quote) { if (char === quote) quote = null; }
      else if ('\'"`'.includes(char)) quote = char;
      else if ('([{'.includes(char)) depth += 1;
      else if (')]}'.includes(char)) depth -= 1;
      else if (char === ',' && depth === 0) { parts.push(part.trim()); part = ''; continue; }
      part += char;
    }
    parts.push(part.trim());
    for (const token of parts) {
      const match = /^(?:get )?([A-Za-z_$][\w$]*)\s*(?:[:(]|$)/.exec(token);
      if (match) keys.add(match[1]);
    }
  }
  return keys;
}

// R111: a moved part reads the live data and window through `app` (its domain context: app.state, app.modalState,
// app.setModalState). In a vm harness that keeps `state` and `modalState` on the sandbox, `app` reads and sets those.
function withApp(sandbox) {
  sandbox.app = {
    get state() { return sandbox.state; },
    get modalState() { return sandbox.modalState; },
    setModalState(value) { sandbox.modalState = value; },
  };
  return sandbox;
}

module.exports = { APP_FILES, appSource, functionSource, contextKeys, withApp };
