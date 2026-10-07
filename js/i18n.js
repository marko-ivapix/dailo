(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // English source strings are the translation keys, so code stays readable and an untranslated
  // key still shows English. A plural entry is keyed by the English "other" form and holds the
  // language's plural categories (Serbian: one / few / other).
  const LOCALES = { en: 'en', sr: 'sr-Latn-RS' };
  const catalogs = { en: {} };
  let language = 'en';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function interpolate(text, params) {
    if (!params) return String(text);
    return String(text).replace(/\{(\w+)\}/g, (match, key) => (own(params, key) ? String(params[key]) : match));
  }

  function tr(source, params) {
    const entry = own(catalogs[language], source) ? catalogs[language][source] : null;
    return interpolate(typeof entry === 'string' ? entry : source, params);
  }

  function trn(count, one, other, params) {
    const values = { count, ...params };
    const entry = own(catalogs[language], other) ? catalogs[language][other] : null;
    if (entry && typeof entry === 'object') {
      const category = new Intl.PluralRules(LOCALES[language]).select(count);
      return interpolate(own(entry, category) ? entry[category] : entry.other, values);
    }
    return interpolate(count === 1 ? one : other, values);
  }

  // Marks a constant (labels in lookup tables, persisted status sentences) as a translation key
  // without translating it; the value is passed to tr() where it is displayed.
  const msg = source => source;

  function addCatalog(code, entries) {
    catalogs[code] = { ...(catalogs[code] || {}), ...entries };
  }

  function setLanguage(code) {
    language = own(LOCALES, code) && own(catalogs, code) ? code : 'en';
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = language === 'sr' ? 'sr-Latn' : 'en';
  }

  const locale = () => LOCALES[language];
  const catalog = code => ({ ...(catalogs[code] || {}) });

  return { tr, trn, msg, addCatalog, setLanguage, locale, catalog, get language() { return language; } };
});
