(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoRelease = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Single source for the release version. sw.js repeats it in its cache name; tests keep them equal.
  const APP_VERSION = '1.9.0';
  // Beta problem reports go to this address by e-mail. Empty hides the report link.
  const REPORT_EMAIL = '';
  const EMAIL_PATTERN = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

  // Builds a mailto: link with version and device details only; app data is never included.
  function problemReportMailto({ email, version = APP_VERSION, userAgent = '', standalone = false, persistence = 'unknown' } = {}) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) return null;
    const subject = `Dailo ${version} — problem report`;
    const body = [
      'Describe what happened and what you expected:',
      '',
      '',
      '---',
      `Version: ${version}`,
      `Device: ${userAgent}`,
      `Installed (standalone): ${standalone ? 'yes' : 'no'}`,
      `Persistent storage: ${persistence}`,
    ].join('\r\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return Object.freeze({ APP_VERSION, REPORT_EMAIL, problemReportMailto });
});
