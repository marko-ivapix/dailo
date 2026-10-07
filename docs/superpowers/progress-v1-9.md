# Dailo V1.9 Progress Ledger

**Baseline:** V1.8 on `main` (`5e4ba82`) plus the V1.9 spec/plan documents
**Spec:** `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-9.md`

## Status

- [x] Spec approved by the user (2026-10-07)
- [x] Plan written
- [x] Step 1 — Fixes and UUID fallback
- [x] Step 2 — Version and problem reports (report address pending)
- [ ] Step 3 — Data protection
- [ ] Step 4 — Install
- [ ] Step 5 — Offline
- [ ] Step 6 — Serbian localization
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

Checks: focused 4 pass + 1 todo; V1.8 design contracts 37/37; full Node **298 pass, 0 fail, 1 todo (299 tests)**; JavaScript syntax 55/55; `git diff --check` passed.
