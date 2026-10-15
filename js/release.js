(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoRelease = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // js/i18n.js loads after this file, so look it up when a report is built.
  const tr = (text, params) => (root.TodoI18n ? root.TodoI18n.tr(text, params) : String(text).replace(/\{(\w+)\}/g, (match, key) => (params && key in params ? String(params[key]) : match)));

  // Single source for the release version. sw.js repeats it in its cache name; tests keep them equal.
  const APP_VERSION = '2.0.0-alpha.121';
  // Beta problem reports go to this address by e-mail. Empty hides the report link.
  const REPORT_EMAIL = 'marko.radicevic@ivapix.cloud';
  // The tester guide is not packaged in the native app; the app opens this online copy instead.
  // R60: the web app's address; the links in the account e-mails lead here.
  const APP_URL = 'https://marko-ivapix.github.io/dailo/';
  const GUIDE_URL = 'https://marko-ivapix.github.io/dailo/uputstvo.html';
  // R40: the terms and the privacy policy that registration links to; like the guide, the app opens them online.
  const TERMS_URL = 'https://marko-ivapix.github.io/dailo/uslovi.html';
  const PRIVACY_URL = 'https://marko-ivapix.github.io/dailo/privatnost.html';
  // R73: the Česta pitanja page.
  const FAQ_URL = 'https://marko-ivapix.github.io/dailo/pitanja.html';
  // R81: the Šta je novo page.
  const WHATS_NEW_URL = 'https://marko-ivapix.github.io/dailo/novo.html';
  const EMAIL_PATTERN = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

  // R82: an error message for the report: quoted text and e-mail addresses are cut out, so no user data goes along.
  const QUOTED = /["'“”„‘’«»][^"'“”„‘’«»]*["'“”„‘’«»]/g;
  function cleanErrorText(text) {
    return String(text ?? '').replace(/[^\s@"'“”„‘’«»<>()]+@[^\s@"'“”„‘’«»<>()]+\.[^\s@"'“”„‘’«»<>():]+/g, '[e-mail]')
      .replace(QUOTED, '"…"').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  const errorLine = entry => [String(entry?.at || '').slice(0, 16).replace('T', ' '), entry?.version, entry?.where, cleanErrorText(entry?.message)]
    .filter(Boolean).join(' · ') + (entry?.count > 1 ? ` (×${entry.count})` : '');

  // Builds a mailto: link with version and device details only; app data is never included. R82: the last errors
  // on this device (at most five, cleaned) go along.
  function problemReportMailto({ email, version = APP_VERSION, userAgent = '', standalone = false, persistence = 'unknown', errors = [] } = {}) {
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
      '',
      tr('Recent errors (no personal data):'),
      ...(Array.isArray(errors) && errors.length ? errors.slice(0, 5).map(errorLine) : [tr('none')]),
    ].join('\r\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return Object.freeze({ APP_VERSION, REPORT_EMAIL, APP_URL, GUIDE_URL, TERMS_URL, PRIVACY_URL, FAQ_URL, WHATS_NEW_URL, cleanErrorText, problemReportMailto });
});
