# Dailo V1.9 Progress Ledger

**Baseline:** V1.8 on `main` (`5e4ba82`) plus the V1.9 spec/plan documents
**Spec:** `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-9.md`

## Status

- [x] Spec approved by the user (2026-10-07)
- [x] Plan written
- [x] Step 1 — Fixes and UUID fallback
- [x] Step 2 — Version and problem reports (report address pending)
- [x] Step 3 — Data protection
- [x] Step 4 — Install
- [x] Step 5 — Offline
- [x] Step 6 — Serbian localization
- [ ] Step 7 — Final verification and package

Open input: the e-mail address for problem reports (requested from the user).

## Baseline evidence (before V1.9 code changes)

Cloud session, Node v22.22.0, Python 3.13.16 (no `.venv`; system `python3`).

| Check | Result |
| --- | ---: |
| `node --test tests/*.test.js` | 288 passed, 0 failed, 0 skipped |
| JavaScript syntax (`js/*.js vendor/*.js tests/*.js`) | 53/53 |
| Python AST (`tests/*.py`) | 19/19 |
| `tests/test_browser_path_adapter.py` | 2/2 |
| `tests/test_browser_regression_registry.py` | 3/3 (functions invoked explicitly) |
| `tests/run-browser-regressions.py --dry-run` | 10/10 static contracts (2 + 3 + 5) |
| `git diff --check` | passed |

## Evidence log

_Step entries are appended below as each step completes._

**Step 1 — fixes and UUID fallback.** New `tests/fixes-v1-9.test.js` (6 tests, all failing before the change for the expected reasons):
- **G1:** a favorite Note/Resource rendered `ph ph-star-fill`, a class Phosphor web 2.1.1 does not define, so the star was blank. It now renders `ph-fill ph-star` (`js/knowledge.js`).
- **G2:** `Core.weekStartKey()` maps `0`/`'sunday'` to `'sunday'` and everything else to `'monday'`. `weekStartFor` and every caller (`js/app.js` ×3, `js/calendar-ui.js` ×2, `js/habits-ui.js` ×3) now go through it, so a stored `0` behaves as Sunday, matching the Settings select. Stored values and `normalizeV16Settings` are unchanged, so there is no data migration.
- **G3:** the disabled "Week starts on: Monday" placeholder is removed from Settings → General. The working control stays under Personalization.
- **D:** `Core.makeUuid()` uses `crypto.randomUUID`, else `crypto.getRandomValues` (RFC 4122 v4 bits), else `Math.random`. It is used by `splitRecurrenceForFuture` and the default `instantiateTemplate` id. A test removes `randomUUID` from `globalThis.crypto` to simulate an insecure context.

Checks: focused 6/6; full Node **294/294**; JavaScript syntax 54/54; `git diff --check` passed.

**Step 2 — version and problem reports.** New `tests/release-v1-9.test.js`. It failed first because `js/release.js` did not exist. It now has 4 passing tests and 1 `todo` release gate.
- **`js/release.js`** (UMD, `globalThis.DailoRelease`):
  - `APP_VERSION = '1.9.0'` and `REPORT_EMAIL` (empty until the user supplies the address);
  - `problemReportMailto()` builds a `mailto:` with a subject plus a CRLF body containing the version, user agent, standalone flag and persistence state. It never includes app data and returns `null` for an empty or invalid address.
- **`index.html`** loads `js/release.js` before `js/core.js`. The `<title>` is now plain "Dailo"; the version is shown in Settings and the brand tooltip instead. This deviates slightly from the spec, which put the version in the title.
- **`js/app.js`:**
  - the brand tooltip uses `Release.APP_VERSION` (the hard-coded "v1.8 prototype" is gone);
  - the domain context exposes `release` and `environmentInfo()` (user agent and standalone detection).
- **`js/backup.js`:** the manifest gains `releaseVersion`. The historical `appVersion: '1.3'` is unchanged and asserted.
- **`js/settings-ui.js`:** new "About" card with version, privacy note and a "Report a problem" link. The link renders only when an address is configured. Only existing classes plus `data-*` hooks are used, so the V1.8 class audit stays green.
- **`css/styles.css`:** new V1.9 layer before the touch-target guard (`a.btn { text-decoration: none; }`).
- The release-gate test is marked `todo` while `REPORT_EMAIL` is empty, so the suite stays green. It becomes a real assertion as soon as the address is set.

Checks: focused 4 pass + 1 todo; V1.8 design contracts 37/37; full Node **298 pass, 0 fail, 1 todo (299 tests)**; JavaScript syntax 56/56 (corrected from an initially recorded 55); `git diff --check` passed.

**Step 3 — data protection.** New `tests/data-protection-v1-9.test.js` (7 tests, all failing before the change).
- **Core rules** (`js/core.js`):
  - `backupReminderDays(settings)`: missing or invalid → 7; integers 0–90 are kept; 0 = off;
  - `oldestCreatedAt(state)`: oldest valid `createdAt` across Tasks, Goals, Habits, Notes and Resources;
  - `backupReminderDue({ lastExport, reminderDays, snoozedUntil, oldestCreatedAt, now })`: counts from `backupStatus.lastExport`, or from the oldest record if there was never an export; nothing is due with no data or while snoozed.
- **Backup** (`js/backup.js`): import validation rejects `backupReminderDays` outside integers 0–90; a round trip keeps the value.
- **Today** (`js/app.js`):
  - `backupReminderNotice()` renders one `role="status"` panel with "Export backup" (the existing `export-backup` action) and "Remind me tomorrow";
  - the snooze writes the device-local `todoAppBackupReminderSnoozedUntil` key (now + 24 h), which is not part of state or backups;
  - the notice is only called from `renderToday()`, never from `renderModal()`.
- **Persistence** (`js/app.js`):
  - `refreshStoragePersistence(request)` feature-detects `navigator.storage.persisted/persist/estimate`;
  - the status is checked at startup without requesting. Persistence is requested once per session on the first user click (user activity) and from Settings. The spec said "after the first successful save"; the click trigger was chosen because timer-driven saves (reminders, date boundary) can happen without user activity.
- **Settings** (`js/settings-ui.js`):
  - "Persistent storage" row with status, MB usage and a "Request" button when the browser reports `denied` (not shown while the state is `unknown` or `unsupported`);
  - "Backup reminder" select (Off / 3 / 7 / 14 / 30 days, plus any imported value);
  - last export/import shown as a formatted `<time datetime="…">`. The raw ISO value stays in `datetime`, so the V1.6 backup-status test is unchanged.
- **Problem report:** `environmentInfo()` now includes the persistence state.
- **CSS:** `.backup-reminder*` styles in the V1.9 layer, before the touch-target guard.
- **Test stubs added** (assertions unchanged): `backupReminderNotice: () => ''` in the two tests that slice `renderToday()` (`tests/tasks-today-v1-5.test.js`, `tests/tasks-today-v1-6.test.js`), and `updateStoragePersistence` in the scheduler harness that slices `init()` (`tests/final-integration-v1-5.test.js`). The latter failed with `updateStoragePersistence is not defined` before the stub.

Checks: focused 7/7; full Node **305 pass, 0 fail, 1 todo (306 tests)**; JavaScript syntax 57/57; `git diff --check` passed.

**Step 4 — install to the Home Screen.** New `tests/install-v1-9.test.js` (4 tests, all failing before the change).
- **`manifest.webmanifest`:**
  - name/short name "Dailo", `lang` `sr-Latn`, `start_url`/`scope` `./` (works under `/dailo/`), `display: standalone`, background and theme `#0F1114`;
  - 192 px and 512 px icons plus a 512 px maskable icon; the test checks each PNG's real dimensions.
- **Icons** (`icons/`):
  - `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and `icon-maskable-512.png`, generated by `tools/generate-icons.py` (Pillow, 4× supersampling) from the sidebar `.brand-mark` geometry;
  - the mark sits inside the maskable safe zone (38% radius; 42% for the plain icons);
  - `icon.svg` is the clipped brand tile, used as the favicon.
- **`index.html`:**
  - `viewport-fit=cover` (the 14 existing `env(safe-area-inset-*)` uses only take effect with it);
  - `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` "Dailo", `apple-mobile-web-app-status-bar-style` `black-translucent`;
  - links to the manifest, the SVG icon and the apple-touch-icon.
- **CSS (V1.9 layer):**
  - `.app-shell` gets top safe-area padding;
  - the viewport-sticky `.sidebar`, `.global-warning` and `.v17-sticky-context` stick below the status bar;
  - phone `.modal` max height subtracts the top inset, so bottom sheets never reach under the status bar.
- **Settings → General:** "Install app" row. When installed (standalone) it says so; otherwise it gives the iPhone steps (Share → Add to Home Screen → Add) and warns that Safari and the installed app keep data separately.

Checks: focused 4/4; V1.8 design contracts 37/37; full Node **309 pass, 0 fail, 1 todo (310 tests)**; JavaScript syntax 58/58; `tools/generate-icons.py` parses; staged `git diff --check` passed. Visual result and status-bar clearance on a real iPhone are **manual-pending**.

**Step 5 — offline start.** New `tests/offline-v1-9.test.js` (6 tests, all failing before the change).
- **Fonts** in `vendor/fonts/`:
  - Geist and Space Grotesk variable `woff2`, `latin` + `latin-ext` subsets, from `@fontsource-variable/geist@5.3.0` and `@fontsource-variable/space-grotesk@5.3.0`;
  - `fonts.css` declares the family names `css/styles.css` already uses (Geist 100–900, Space Grotesk 300–700), with the upstream `unicode-range`s;
  - the OFL license files are included;
  - about 87 KB in total. Geist 700, which the CSS uses, is now real instead of synthesized.
- **Icons** in `vendor/phosphor/`:
  - `@phosphor-icons/web@2.1.1` regular and fill `woff2` (~279 KB);
  - the CSS is rewritten so `@font-face` points only at the local `woff2`;
  - the MIT `LICENSE` is included (CRLF normalized to LF for `git diff --check`; text unchanged).
- **`index.html`:** the Google Fonts and unpkg links and preconnects are removed. A test asserts that no `http(s)://` reference remains and that every local reference exists.
- **Icon audit:** every literal `ph-*` icon name in `index.html` and `js/*.js` exists in the vendored CSS. It passes after the G1 fix, so no other broken icon names were found.
- **`sw.js`** (scope `./`):
  - precaches the exact runtime shell into `dailo-shell-<VERSION>`. A test derives the expected list from `index.html`, its stylesheets' `url()`s and the manifest icons, and requires the two to be equal;
  - `VERSION` must equal `APP_VERSION`;
  - `activate` deletes only older `dailo-shell-*` caches and claims clients;
  - `fetch`:
    - cache-first for shell files (query strings ignored);
    - navigations to the app page (`./`, `index.html`) get the cached `index.html`;
    - other pages and downloads under the scope (docs, release ZIPs), cross-origin requests and non-GET requests are not intercepted;
  - `skipWaiting` runs only from a `SKIP_WAITING` message.
- **`js/app.js`:**
  - `registerServiceWorker()` runs only on `https:`/`localhost`;
  - a waiting worker produces a "A new version of Dailo is available — Refresh" toast;
  - `applyAppUpdate()` (the only `SKIP_WAITING` sender) flushes pending text and reloads once on `controllerchange`;
  - the first install shows no prompt.
- **Test stub added** (assertions unchanged): `registerServiceWorker() {}` in the scheduler harness that slices `init()`.

Checks: focused 6/6; full Node **315 pass, 0 fail, 1 todo (316 tests)**; JavaScript syntax 59/59 plus `node --check sw.js`; static browser contracts 10/10; staged `git diff --check` passed. Real offline launch and the update prompt on iPhone are **manual-pending**.

**Step 6 — Serbian localization.** New `tests/i18n-v1-9.test.js` (9 tests) and `tests/quick-add-v1-9.test.js` (5 tests). Both failed before the change: `js/i18n.js` did not exist, and the Serbian Quick Add phrases came back unparsed.
- **Mechanism** (`js/i18n.js`, `js/i18n-sr.js`, loaded after `js/release.js` and before `js/core.js`):
  - `tr(source, params)` uses the English source string as the key, with `{name}` placeholders;
  - `trn(count, one, other, params)` uses `Intl.PluralRules` (Serbian one/few/other, keyed by the English "other" form);
  - `msg(source)` only marks a key in lookup tables, persisted status sentences and thrown errors;
  - `trMessage(text)` shows a stored or thrown message: the whole text when it is a key, otherwise "Prefix: detail" with the prefix translated. Unknown text passes through;
  - `I18n.locale()` is `sr-Latn-RS` in the browser and `en` in Node.
- **Catalog:** 1420 entries, 61 of them plurals, Latin script only. The completeness test requires an entry for every literal `tr`/`msg`/`trn` key in `index.html` and `js/*.js`, with the same placeholders, and rejects unused entries and template-literal keys.
- **Surfaces:**
  - `index.html` is translated directly (`lang="sr-Latn"`);
  - every view, dialog, popover, toast, Undo message, Search label, recovery screen, Settings row and sample/starter title goes through the catalog;
  - `Intl` date and number formats use `I18n.locale()`;
  - typed `RESET`/`RESTORE`, the brand, IDs, persisted enum values and user data are unchanged.
- **Errors:**
  - user-visible errors in `js/app.js`, `js/backup.js`, `js/storage.js` and `js/core.js` are `msg`-marked;
  - dynamic ones now have the form "Prefix: detail". English shapes that changed: for example `Backup exceeds ZIP entry limit (2000)` → `Backup exceeds ZIP entry limit: 2000`, `Invalid backup dueDate` → `Invalid backup: dueDate`, `Invalid tasks record` → `Invalid stored record: tasks`, plus the two `AggregateError` summaries. Existing test regexes still match.
  - Persisted English `validationResult` sentences are translated at display time (no migration).
- **Quick Add** (`Core.parseQuickPlanPhrase`):
  - accepts `danas`, `sutra`, `ponedeljak`, `utorak`, `sreda`/`sredu`, `četvrtak`/`cetvrtak`, `petak`, `subota`/`subotu` and `nedelja`/`nedelju`;
  - an optional `u` may come before a Serbian weekday;
  - time is accepted as `u H:MM` or `u HH:MM`, and a single-digit hour is padded (this also applies to English `at 9:05`);
  - the English keywords and every existing Quick Add assertion are unchanged;
  - `Core.splitQuickTime` is shared with the no-date branch of `parseQuickAddTitle`.
- **Untranslated-text audit:**
  - a small lexer reads every template literal and quoted markup string in `js/*.js`, skipping comments, strings and regex literals. Text nodes and `aria-label`/`aria-description`/`title`/`placeholder`/`alt` values may contain only `${…}` expressions and allowlisted words (`Dailo`, `https`, `ZIP`, `JSON`, `RESET`, `RESTORE`);
  - it scans more than 4000 texts and finds none;
  - a self-test proves the lexer catches English in nested templates and quoted markup and ignores regex literals and comments. Injecting `<em>Check in now</em>` into `js/habits-ui.js` made it fail, and the file was then restored;
  - `index.html` may not contain any text that the catalog translates.
- **Readable label:** a Goal's linked-habit progress line shows the metric label (`Check-ins`/`Streak`/`Periods`, translated) instead of the raw key `totalCheckins`.
- **Implementation differs from the spec (spec F.1, F.2, F.4, F.12):**
  - the functions are named `tr`/`trn`/`msg`/`trMessage` and `setLanguage`, because `t` is a common local variable in `js/app.js`;
  - modules read `window.TodoI18n` directly, and tests inject an English `I18n` through `tests/support/i18n.js` (`withI18n`, `runInNewContextWithI18n`; 18 test files wired) instead of per-test `t: s => s` stubs;
  - the hard-coded weekday/month arrays are `msg`-marked catalog entries rather than `Intl`-derived names;
  - the surfaces landed in one commit (`fa638c5`) plus this follow-up, not one commit per surface; the full suite was green at each commit.
- **Test source-text updates** (same intent, assertions not weakened):
  - `tests/accessibility-v1-7.test.js`, `tests/design-v1-8.test.js`, `tests/inbox-v1-6.test.js`, `tests/modal-ux-v1-6.test.js` and `tests/navigation-v1-7.test.js` now match the `tr(…)`/`msg(…)` source;
  - `tests/insights-v1-5.test.js` expects `4 / 2 Check-ins · 100%`;
  - `tests/ui-v1-6-knowledge.py` (static contract) now matches the `tr(…)` source and the per-type `msg('Note deleted')`/`msg('Resource deleted')` Undo messages. It was red after `fa638c5` (2 checks asserted English source text) and is fixed here.
- **Found during the docs sync:** the Home Screen icons use the sidebar `.brand-mark` rings in white on a full-bleed blue tile, not the geometric "D" on graphite that the spec describes (Step 4). Service worker registration also accepts `127.0.0.1`.
- **Not covered:** the Playwright scenario scripts (`tests/ui-*.py` run in a browser) still use English text selectors, so they are out of date for the Serbian UI. They are not part of release verification.

Checks: focused i18n 9/9 and Quick Add 5/5; full Node **329 pass, 0 fail, 1 todo (330 tests)**; JavaScript syntax 63/63 (`js/*.js vendor/*.js tests/*.js`) plus `tests/support/i18n.js` and `sw.js`; static browser contracts 10/10 (dry-run); registry 3/3; path adapter OK; `git diff --check` passed. Serbian wording on a real iPhone (truncation, line breaks) is **manual-pending**.

**Merge into `main` (2026-10-08).** At the user's request, PR #5 merged Steps 1–6 and the docs sync into `main`, so V1.9 can be tried on GitHub Pages before the release is complete. `REPORT_EMAIL` is still empty: the "Report a problem" link stays hidden and the release-gate test stays `todo`. The V1.9 ZIP and the manual iPhone pass are still open.

## Manual iPhone acceptance (spec "Acceptance")

| Date | Device / browser | Source | Observed | Result |
| --- | --- | --- | --- | --- |
| 2026-10-08 | iPhone, Safari, then installed to the Home Screen | GitHub Pages `https://marko-ivapix.github.io/dailo/` at `5554877` (PR #5) | V1.9 works on the phone; the app was installed to the Home Screen | Passed (reported by the user) |
| 2026-10-08 | iPhone, installed app | same | The installed app works in airplane mode; the interface is entirely in Serbian | Passed (reported by the user) |
| 2026-10-08 | iPhone, installed app | same | Serbian Quick Add works; the favorite star is visible | Passed (reported by the user) |
| 2026-10-08 | iPhone, installed app | same | Standalone layout looks right; content does not go under the status bar | Passed (reported by the user) |
| 2026-10-08 | iPhone, installed app | same | The bottom navigation stays clear of the home indicator | Passed (reported by the user) |

Only the items in this table were observed. Still **manual-pending**:
- update prompt after a new deploy;
- persistence status;
- backup reminder plus export and import into the installed app.
