// English i18n for vm sandboxes. Without the Serbian catalog, tr() returns the English source, so
// tests keep asserting English text while the browser UI is Serbian.
const vm = require('node:vm');
const I18n = require('../../js/i18n.js');

const i18nGlobals = () => ({ I18n, TodoI18n: I18n, tr: I18n.tr, trn: I18n.trn, trMessage: I18n.trMessage, msg: I18n.msg });

function withI18n(sandbox) {
  Object.assign(sandbox, i18nGlobals());
  if (sandbox.window && typeof sandbox.window === 'object') sandbox.window.TodoI18n = I18n;
  return sandbox;
}

const runInNewContextWithI18n = (code, sandbox = {}, options) => vm.runInNewContext(code, withI18n(sandbox), options);

module.exports = { I18n, i18nGlobals, withI18n, runInNewContextWithI18n };
