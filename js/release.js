(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoRelease = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // js/i18n.js loads after this file, so look it up when a report is built.
  const tr = (text, params) => (root.TodoI18n ? root.TodoI18n.tr(text, params) : String(text).replace(/\{(\w+)\}/g, (match, key) => (params && key in params ? String(params[key]) : match)));

  // Single source for the release version. sw.js repeats it in its cache name; tests keep them equal.
  const APP_VERSION = '2.0.0-alpha.21';
  // Beta problem reports go to this address by e-mail. Empty hides the report link.
  const REPORT_EMAIL = 'marko.radicevic@ivapix.cloud';
  // The tester guide is not packaged in the native app; the app opens this online copy instead.
  const GUIDE_URL = 'https://marko-ivapix.github.io/dailo/uputstvo.html';
  const EMAIL_PATTERN = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

  // Builds a mailto: link with version and device details only; app data is never included.
  function problemReportMailto({ email, version = APP_VERSION, userAgent = '', standalone = false, persistence = 'unknown' } = {}) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) return null;
    const subject = tr('Dailo {version} — problem report', { version });
    const body = [
      tr('Describe what happened and what you expected:'),
      '',
      '',
      '---',
      tr('Version: {version}', { version }),
      tr('Device: {device}', { device: userAgent }),
      tr('Installed (standalone): {value}', { value: standalone ? tr('yes') : tr('no') }),
      tr('Persistent storage: {value}', { value: persistence }),
    ].join('\r\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return Object.freeze({ APP_VERSION, REPORT_EMAIL, GUIDE_URL, problemReportMailto });
});
