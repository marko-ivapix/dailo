// Redesign R22b: the one fold button of js/app.js, for tests that stub the domain context or run app functions in vm.
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const start = app.indexOf('\n  function foldButton(') + 1;
const foldButtonSource = app.slice(start, app.indexOf('\n  }\n', start) + 4);
const foldButton = new Function(`${foldButtonSource}; return foldButton;`)();

module.exports = { foldButton, foldButtonSource };
