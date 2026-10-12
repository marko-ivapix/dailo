// Redesign R47c: the two-column wrapper of js/app.js, for tests that stub the domain context or run app functions in vm.
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const start = app.indexOf('\n  function screenColumns(') + 1;
const screenColumnsSource = app.slice(start, app.indexOf('\n  }\n', start) + 4);
const screenColumns = new Function(`${screenColumnsSource}; return screenColumns;`)();

module.exports = { screenColumns, screenColumnsSource };
