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
  - "Persistent storage" row with status, MB usage and a "Request" button when not granted;
  - "Backup reminder" select (Off / 3 / 7 / 14 / 30 days, plus any imported value);
  - last export/import shown as a formatted `<time datetime="…">`. The raw ISO value stays in `datetime`, so the V1.6 backup-status test is unchanged.
- **Problem report:** `environmentInfo()` now includes the persistence state.
- **CSS:** `.backup-reminder*` styles in the V1.9 layer, before the touch-target guard.
- **Test stubs added** (assertions unchanged): `backupReminderNotice: () => ''` in the two tests that slice `renderToday()` (`tests/tasks-today-v1-5.test.js`, `tests/tasks-today-v1-6.test.js`), and `updateStoragePersistence` in the scheduler harness that slices `init()` (`tests/final-integration-v1-5.test.js`). The latter failed with `updateStoragePersistence is not defined` before the stub.

Checks: focused 7/7; full Node **305 pass, 0 fail, 1 todo (306 tests)**; JavaScript syntax 57/57; `git diff --check` passed.
